var GitHubApi = require('github'),
    _ = require('underscore'),
    async = require('async');

/**
 * Converts an array of slug identifiers like "org/repo" into an array of arrays
 * like:
 * [ ["org", "repo"] ]
 */
function convertSlugsToObjects(slugs) {
    return slugs.map(function(slug) {
        return slug.split('/');
    });
}

/**
 * Sorts array of issue objects by last updated date.
 */
function sortIssues(issues) {
    return _.sortBy(issues, function(issue) {
        return new Date(issue.updated_at);
    }).reverse();
}

/**
 * Wrapper class around the Github API client, providing some authentication
 * convenience and additional utility functions for executing operations across
 * the issue trackers of several repositories at once.
 * @param username {string} Github username credential for authentication.
 * @param password {string} Github password credential for authentication.
 * @param repoSlugs {string[]} List of repository slug strings to operate upon.
 */
function Sprinter(username, password, repoSlugs) {
    if (! username) {
        throw new Error('Missing username.');
    }
    if (! password) {
        throw new Error('Missing password.');
    }
    if (! repoSlugs) {
        throw new Error('Missing repositories.');
    }
    this.username = username;
    this.password = password;
    // Verify required configuration elements.
    this.repos = convertSlugsToObjects(repoSlugs);
    this.gh = new GitHubApi({
        version: '3.0.0',
        timeout: 5000
    });
    this.gh.authenticate({
        type: 'basic',
        username: this.username,
        password: this.password
    });
}

Sprinter.prototype._eachRepo = function(fn, mainCallback) {
    var funcs = this.repos.map(function(repoSlug) {
        var org = repoSlug[0],
            repo = repoSlug[1];
        return function(callback) {
            fn(org, repo, callback);
        };
    });
    async.parallel(funcs, mainCallback);
};

Sprinter.prototype._eachRepoFlattened = function(fn, mainCallback) {
    this._eachRepo(fn, function(err, data) {
        mainCallback(err, _.flatten(data));
    });
};

/**
 * Returns all issues across all monitored repos. Optional filters can be provided
 * to filter results.
 * @param [userFilters] {object} Filter, like {state: 'closed'}.
 * @param mainCallback {function} Called with err, issues when done. Issues are
 *                                sorted by updated_at.
 */
Sprinter.prototype.getIssues = function(userFilters, mainCallback) {
    var me = this,
        filters,
        milestone;
    if (typeof(userFilters) == 'function' && mainCallback == undefined) {
        mainCallback = userFilters;
        userFilters = {};
    }
    filters = _.extend({state: 'open'}, userFilters);
    if (filters.milestone) {
        milestone = filters.milestone;
        delete filters.milestone;
    }
    console.log('getIssues');
    this._eachRepoFlattened(function(org, repo, localCallback) {
        var localFilters = _.clone(filters);
        localFilters.user = org;
        localFilters.repo = repo;
        console.log(filters);
        console.log(localFilters);
        me.gh.issues.repoIssues(localFilters, function(err, issues) {
            if (err) {
                err.repo = org + '/' + repo;
                localCallback(err);
            } else {
                localCallback(err, _.map(issues, function(issue) {
                    issue.repo = org + '/' + repo;
                    return issue;
                }));
            }
        });
    }, function(err, issues) {
        if (err) {
            mainCallback(err);
        } else {
            if (milestone) {
                issues = _.filter(issues, function(issue) {
                    if (issue.milestone == null) { return false; }
                    return issue.milestone.title == milestone;
                });
            }
            mainCallback(err, sortIssues(issues));
        }
    });
};

/**
 * Returns all milestones across monitored repos, grouped by title. Useful for
 * standard milestone periods like sprints.
 * @param mainCallback {function} Called with err, milestones.
 */
Sprinter.prototype.getMilestones = function(mainCallback) {
    var me = this;
    this._eachRepoFlattened(function(org, repo, localCallback) {
        me.gh.issues.getAllMilestones({
            user: org,
            repo: repo
        }, function(err, milestones) {
            if (err) {
                err.repo = org + '/' + repo;
                localCallback(err);
            } else {
                localCallback(err, _.map(milestones, function(milestone) {
                    milestone.repo = org + '/' + repo;
                    return milestone;
                }));
            }
        });
    }, function(err, milestones) {
        if (err) {
            mainCallback(err);
        } else {
            mainCallback(err, _.groupBy(milestones, 'title'));
        }
    });
};

/**
 * Closes all milestones across all monitored repos that match given title.
 * @param title {string} Milestone to delete.
 * @param mainCallback {function} Called with err, updated milestones.
 */
Sprinter.prototype.closeMilestones = function(title, mainCallback) {
    var me = this;
    this.getMilestones(function(err, milestones) {
        var matches;
        if (err) {
            mainCallback(err);
        } else {
            matches = milestones[title];
            if (! matches) {
                mainCallback(null, []);
            } else {
                console.log('Closing ' + matches.length + ' milestones.');
                var updaters = _.map(matches, function(match) {
                    var splitSlug = match.repo.split('/');
                    return function(localCallback) {
                        me.gh.issues.updateMilestone({
                            user: splitSlug[0],
                            repo: splitSlug[1],
                            number: match.number,
                            title: match.title,
                            state: 'closed'
                        }, function(err, resp) {
                            if (err) {
                                err.repo = org + '/' + repo;
                                localCallback(err);
                            } else {
                                localCallback(err, resp);
                            }
                        });
                    };
                });
                async.parallel(updaters, mainCallback);
            }
        }
    });
};

/**
 * Creates the same milestone across all monitored repos.
 * @param milestone {object} Should contain a title and due_on.
 * @param mainCallback {function} Called with err, created milestones.
 */
Sprinter.prototype.createMilestones = function(milestone, mainCallback) {
    var me = this;
    this._eachRepo(function(org, repo, localCallback) {
        var payload = _.extend({
            user: org,
            repo: repo
        }, milestone);
        me.gh.issues.createMilestone(payload, function(err, result) {
            if (err) {
                err.repo = org + '/' + repo;
                localCallback(err);
            } else {
                localCallback(err, result);
            }
        });
    }, mainCallback);
};

/**
 * Updates the same milestone across all monitored repos.
 * @param title {string} Title of the milestone to be updated.
 * @param milestone {object} Must contain at least a title to update.
 * @param mainCallback {function} Called with err, updated milestones.
 */
Sprinter.prototype.updateMilestones = function(title, milestone, mainCallback) {
    var me = this;
    this._eachRepo(function(org, repo, localCallback) {
        var payload = {
            user: org,
            repo: repo
        };
        me.gh.issues.getAllMilestones(payload, function(err, milestones) {
            var slug = org + '/' + repo;
            if (err) {
                err.repo = slug;
                localCallback(err);
            } else {
                var match = _.find(milestones, function(milestone) {
                        return milestone.title == title;
                    }),
                    result = undefined;
                if (match) {
                    result = {
                        repo: slug,
                        number: match.number
                    }
                }
                localCallback(null, result);
            }
        });
    }, function(err, milestonesToUpdate) {
        if (err) {
            mainCallback(err);
        } else {
            me._eachRepo(function(org, repo, milestoneUpdateCallback) {
                var slug = org + '/' + repo,
                    milestoneToUpdate = _.find(milestonesToUpdate, function(ms) {
                        return ms && ms.repo == slug;
                    }),
                    payload = undefined;
                if (milestoneToUpdate) {
                    payload = _.extend({
                        user: org,
                        repo: repo,
                        number: milestoneToUpdate.number,
                    }, milestone);
                    me.gh.issues.updateMilestone(payload, function(err, result) {
                        if (err) {
                            err.repo = org + '/' + repo;
                            milestoneUpdateCallback(err);
                        } else {
                            milestoneUpdateCallback(err, result);
                        }
                    });
                }
            }, mainCallback);
        }
    });
};

/**
 * Creates the same labels across all monitored repos.
 * @param labels {Array} Should be a list of objects, each with a name and hex color (without the #).
 * @param mainCallback {function} Called with err, created labels.
 */
Sprinter.prototype.createLabels = function(labels, mainCallback) {
    var me = this;
    this._eachRepo(function(org, repo, localCallback) {
        var createFunctions = _.map(labels, function(labelSpec) {
            var payload = _.extend({
                user: org,
                repo: repo
            }, labelSpec);
            return function(callback) {
                me.gh.issues.createLabel(payload, callback);
            };
        });
        async.parallel(createFunctions, localCallback);
    }, mainCallback);
};

module.exports = Sprinter;
