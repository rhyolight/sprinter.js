var GitHubApi = require('github')
  , _ = require('underscore')
  , async = require('async')
  , pageRegex = new RegExp("&page=(\\d*)")
  , relRegex = new RegExp("rel=\"(.*)\"")
  ;

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

function attachReadableErrorMessage(err) {
    var errorMessage;
    try {
        errorMessage = JSON.parse(err.message);
    } catch (jsonParseError) {
        return err;
    }
    // 404 means unknown repo
    if (err.code == 404 && err.repo) {
        err.message = 'Unknown repository: "' + err.repo + '"';
    }
    // 410 means repo has no GitHub Issues
    else if (err.code == 410 && err.repo) {
        err.message = '"' + err.repo + '" has no GitHub Issues associated with it.';
    }
    // 422 means validation error
    else if (err.code == 422 && err.repo) {
        err.message = 'Validation error on "' + err.repo + '": ' + JSON.stringify(errorMessage.errors);
    }
    return err;
}

/**
 * Simple utility for creating a range array.
 * @param start
 * @param end
 * @returns {Array}
 */
function range(start, end) {
    var out = [];
    for (var i = start; i <= end; i++) {
        out.push(i);
    }
    return out;
}

/**
 * Removes duplicate collaborators.
 * @param collaborators
 * @returns {Array}
 */
function deduplicateCollaborators(collaborators) {
    var foundLogins = [];
    return _.filter(collaborators, function (collaborator) {
        var duplicate = false
          , login = collaborator.login;
        if (foundLogins.indexOf(login) > -1) {
            duplicate = true;
        } else {
            foundLogins.push(login);
        }
        return ! duplicate;
    });
}

/**
 * Wrapper class around the GitHub API client, providing some authentication
 * convenience and additional utility functions for executing operations across
 * the issue trackers of several repositories at once.
 * @param username {string} GitHub username credential for authentication.
 * @param password {string} GitHub password credential for authentication.
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
    var me = this
      , defaultFilters = {state: 'open'}
      , filters
      , milestone
      , issueFetcher;
    if (typeof(userFilters) == 'function' && mainCallback == undefined) {
        mainCallback = userFilters;
        userFilters = {};
    }
    filters = _.extend(defaultFilters, userFilters);
    if (filters.milestone) {
        milestone = filters.milestone;
        delete filters.milestone;
    }

    function issueFetcher(org, repo, localCallback) {
        var localFilters = _.clone(filters)
        // We have to stash this because it seems that the Node.js GitHub Client mutates the filter
        // object going into the repoIssues call, destroying the date string.
            , since = localFilters.since;
        localFilters.user = org;
        localFilters.repo = repo;
        me.gh.issues.repoIssues(localFilters, function(err, issues) {
            var links = {}
                , localFiltersWithPage = undefined;
            if (err) {
                err.repo = org + '/' + repo;
                localCallback(err);
            } else {
                // Handles pagination. Page details are in meta.link. If there are more
                // pages to fetch, it is done within this condition and issues from next
                // pages are added to the output issues array.
                if (issues.meta && issues.meta.link) {
                    var returnCount = 0;
                    _.each(issues.meta.link.split(','), function(link) {
                        var parts = link.split(';')
                            , pageNumber = parseInt(parts[0].match(pageRegex)[1])
                            , rel = parts[1].match(relRegex)[1];
                        links[rel] = pageNumber;
                    });
                    _.each(range(links.next, links.last), function(page) {
                        localFiltersWithPage = _.clone(localFilters);
                        if (since) {
                            localFiltersWithPage.since = since;
                        }
                        localFiltersWithPage.page = page;
                        me.gh.issues.repoIssues(localFiltersWithPage, function(err, pageIssues) {
                            returnCount++;
                            if (err) {
                                err.repo = org + '/' + repo;
                                localCallback(err);
                            } else {
                                issues = issues.concat(pageIssues);
                                // We're done when all the pages have returned (minus 1 because the first page
                                // was already loaded.
                                if (returnCount == links['last'] - 1) {
                                    localCallback(err, _.map(issues, function(issue) {
                                        issue.repo = org + '/' + repo;
                                        return issue;
                                    }));
                                }
                            }
                        });
                    });
                } else {
                    localCallback(err, _.map(issues, function(issue) {
                        issue.repo = org + '/' + repo;
                        return issue;
                    }));
                }
            }
        });
    }

    this._eachRepoFlattened(issueFetcher, function(err, issues) {
        if (err) {
            mainCallback(attachReadableErrorMessage(err));
        } else {
            if (milestone) {
                issues = _.filter(issues, function(issue) {
                    if (issue.milestone == null) { return false; }
                    return issue.milestone.title == milestone;
                });
            }
            mainCallback(null, sortIssues(issues));
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
            mainCallback(attachReadableErrorMessage(err));
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
            mainCallback(attachReadableErrorMessage(err));
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
    }, function(err, response) {
        if (err) {
            mainCallback(attachReadableErrorMessage(err));
        } else {
            mainCallback(err, response);
        }
    });
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
            mainCallback(attachReadableErrorMessage(err));
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
                me.gh.issues.createLabel(payload, function(err, resp) {
                    if (err) {
                        err.repo = org + '/' + repo;
                        callback(err);
                    } else {
                        callback(err, resp);
                    }
                });
            };
        });
        async.parallel(createFunctions, localCallback);
    }, function(err, response) {
        if (err) {
            mainCallback(attachReadableErrorMessage(err));
        } else {
            mainCallback(err, response);
        }
    });
};

/**
 * Returns all labels across monitored repos. Also attaches a "repo" attribute
 * so users can tell what repo labels are coming from.
 * @param mainCallback {function} Called with err, labels.
 */
Sprinter.prototype.getLabels = function(mainCallback) {
    var me = this;
    this._eachRepoFlattened(function(org, repo, localCallback) {
        me.gh.issues.getLabels({
            user: org,
            repo: repo
        }, function(err, labels) {
            if (err) {
                err.repo = org + '/' + repo;
                localCallback(err);
            } else {
                localCallback(err, _.map(labels, function(label) {
                    label.repo = org + '/' + repo;
                    return label;
                }));
            }
        });
    }, function(err, labels) {
        if (err) {
            mainCallback(attachReadableErrorMessage(err));
        } else {
            mainCallback(err, labels);
        }
    });
};

/**
 * Returns all collaborators across monitored repos.
 * @param mainCallback {function} Called with err, collaborators.
 */
Sprinter.prototype.getCollaborators = function(mainCallback) {
    var me = this;
    this._eachRepoFlattened(function(org, repo, localCallback) {
        me.gh.repos.getCollaborators({
            user: org,
            repo: repo,
            per_page: 1000
        }, function(err, collaborators) {
            if (err) {
                err.repo = org + '/' + repo;
                localCallback(err);
            } else {
                localCallback(err, collaborators);
            }
        });
    }, function(err, collaborators) {
        if (err) {
            mainCallback(attachReadableErrorMessage(err));
        } else {
            mainCallback(err, deduplicateCollaborators(collaborators));
        }
    });
};


module.exports = Sprinter;
