var GitHubApi = require('github')
  , _ = require('lodash')
  , async = require('async')
  , originalPrototypeFunctions = {}
  , markdownTasksRegex = /^((\-|\*) \[.\].*)$/gm
  , subtaskRegex = /(https?\:\/\/(www\.)?.*\/issues\/|\#)(\d+)/
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
    var sorted;
    // Issues might be pre-arranged by super/sub tasks.
    if (Object.keys(issues).indexOf('supers') > -1) {
        // Network format issue sort
        issues.supers = _.sortBy(issues.supers, function(issue) {
            return new Date(issue.updated_at);
        }).reverse();

        issues.singletons = _.sortBy(issues.singletons, function(issue) {
            return new Date(issue.updated_at);
        }).reverse();
        sorted = issues;
    } else {
        sorted = _.sortBy(issues, function(issue) {
            return new Date(issue.updated_at);
        }).reverse();
    }
    return sorted;
}

function attachReadableErrorMessage(err) {
    var errorMessage;

    // If the error doesn't have a "repo" attached to it, it's a hard error.
    // This should always be attached by sprinter before it gets to the user.
    if (! err.repo) {
        throw new Error('Error does not identify a repository!');
    }

    try {
        errorMessage = JSON.parse(err.message);
    } catch (jsonParseError) {
        errorMessage = 'Unable to parse error message. Entire error is: "'
            + err.toString() + '"';
    }
    // 403 means unauthorized.
    if (err.code == 403) {
        err.message = 'You must have push access to run this operation on "'
            + err.repo + '".';
    }
    // 404 means unknown repo
    else if (err.code == 404) {
        err.message = 'Unknown repository: "' + err.repo + '"';
    }
    // 410 means repo has no GitHub Issues
    else if (err.code == 410) {
        err.message = '"' + err.repo
            + '" has no GitHub Issues associated with it.';
    }
    // 422 means validation error
    else if (err.code == 422) {
        err.message = 'Validation error on "' + err.repo + '": '
            + JSON.stringify(errorMessage.errors);
    }
    return err;
}


function attachReadableErrorMessages(errs) {
    if (errs && errs.length) {
        return _.map(errs, function(err) {
            return attachReadableErrorMessage(err);
        });
    }
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
 * Using regex, finds subtasks within a super issue's body string and returns
 * them in an array of issue numbers. 
 * @param superIssue
 * @returns {Array}
 */
function extractSuperIssueSubTaskNumbers(superIssue) {
    var matches = superIssue.body.match(markdownTasksRegex)
      , subTaskIds = [];
    _.each(matches, function(line) {
        var match = line.match(subtaskRegex);
        if (match) {
            subTaskIds.push(parseInt(match[3]));
        }
    });
    return subTaskIds;
}

/**
 * Takes an array of issue objects and presents them differently depending on
 * 'format'. The only valid option now is "network", which groups super issue
 * subtasks into a "subtasks" array on the super issue object.
 * @param format {string} 'network' or null
 * @param issues {array}
 * @returns {object} with 'supers' array, 'singletons' array and 'size' for
 *                   total number of issues in all.
 */
function formatIssues(format, issues) {
    var formattedIssues
      , partition
      , superIssues
      , singletonIssues
      , removedSubtasks = [];
    if (format == 'network') {
        formattedIssues = {
            supers: []
          , singletons: []
          , all: issues
        };
        partition = _.partition(issues, function(issue) {
            return _.find(issue.labels, function(label) {
                return label.name == 'super';
            });
        });
        superIssues = partition.shift();
        singletonIssues = partition.shift();
        _.each(superIssues, function(superIssue) {
            var subTaskNumbers = extractSuperIssueSubTaskNumbers(superIssue);
            superIssue.subtasks = _.filter(singletonIssues, function(issue) {
                var isSubtask = _.contains(subTaskNumbers, issue.number);
                if (isSubtask) {
                    removedSubtasks.push(issue.number);
                }
                return isSubtask;
            });
        });
        formattedIssues.supers = superIssues;
        _.each(singletonIssues, function(issue) {
            if (! _.contains(removedSubtasks, issue.number)) {
                formattedIssues.singletons.push(issue);
            }
        });
    } else {
        formattedIssues = issues;
    }
    return formattedIssues;
}

/**
 * Wrapper class around the GitHub API client, providing some authentication
 * convenience and additional utility functions for executing operations across
 * the issue trackers of several repositories at once.
 * @param username {string} GitHub username credential for authentication.
 * @param password {string} GitHub password credential for authentication.
 * @param repoSlugs {string[]} List of repository slug strings to operate upon.
 * @param cache {int} How many seconds to cache fetched results. Default is 0.
 */
function Sprinter(username, password, repoSlugs, cache) {
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
        version: '3.0.0'
      , timeout: 5000
    });
    this.gh.authenticate({
        type: 'basic'
      , username: this.username
      , password: this.password
    });
    this._CACHE = {};
    this.setCacheDuration(cache);
    this._setupCaching();
}

Sprinter.prototype._cacheIsValid = function(cacheKey) {
    var cache = this._CACHE[cacheKey];
    if (! cache) {
        return false;
    }
    return (new Date().getTime() < cache.time + this._cacheDuration * 1000);
};


/**
 * Wraps calls to get* functions with a function that caches results.
 */
Sprinter.prototype._setupCaching = function() {
    var cacheDuration = this._cacheDuration
      , me = this;
    _.each(originalPrototypeFunctions, function(fn, name) {
        if (name.indexOf('get') == 0) {
            // console.log('wrapping %s', name);
            me[name] = function() {

                // Default cache key is function name.
                var cacheKey = name
                  , callback
                  , newArguments = [];

                function resultCacher(err, result) {
                    // Don't cache if duration is 0.
                    if (me._cacheDuration) {
                        //console.log('caching response for %s', cacheKey);
                        me._CACHE[cacheKey] = {
                            time: new Date().getTime()
                          , result: result
                          , errors: err
                        };
                    }
                    callback(err, result);
                }

                // If function was passed a filter object, we must update the 
                // cache key to include specific filters.
                if (typeof(arguments[0]) == 'object') {
                    cacheKey = name + JSON.stringify(arguments[0]);
                    // 2nd parameter will be a callback if the first was a
                    // filter.
                    callback = arguments[1];
                    newArguments = [arguments[0], resultCacher]
                } else {
                    // 1st parameter is a callback if there was no filter.
                    callback = arguments[0];
                    newArguments = [resultCacher]
                }

                // If result has already been cached, use it.
                if (me._cacheIsValid(cacheKey, cacheDuration)) {
                    // console.log('using cache for %s', cacheKey);
                    callback(
                        me._CACHE[cacheKey].errors, me._CACHE[cacheKey].result
                    );
                } else {
                    // console.log('skipping cache for %s', cacheKey);
                    fn.apply(me, newArguments);
                }

            };
        }
    });
};

Sprinter.prototype._eachRepo = function(fn, mainCallback) {
    var asyncErrors = []
      , funcs = this.repos.map(function(repoSlug) {
            var org = repoSlug[0]
              , repo = repoSlug[1]
              , slug = org + '/' + repo;
            return function(callback) {
                fn(org, repo, function(error, data) {
                    // All errors must have a "repo" property to identify
                    // where they came from.
                    function addRepoToError(err) {
                        err.repo = slug;
                        return err;
                    }
                    if (error) {
                        // Depending on which API function gets called, this
                        // error object could be an Array or just one Error
                        // object, so we'll have to deal with both.
                        if (error.length !== undefined) {
                            asyncErrors = asyncErrors.concat(
                                _.each(error, addRepoToError)
                            );
                        } else {
                            asyncErrors.push(addRepoToError(error));
                        }
                    }
                    callback(null, data);
                });
            };
        });
    async.parallel(funcs, function(err, data) {
        // Overrides the default async behavior of stopping on errors by
        // collecting them here, converting them into readable messages, and
        // passing them all back to the main callback. The "data" array might
        // have null values, which usually happens if there is an error, so we
        // make sure to filter out the nulls.
        mainCallback(
            attachReadableErrorMessages(asyncErrors)
          , _.filter(data, function(item) {
                return item;
            })
        );
    });
};

Sprinter.prototype._eachRepoFlattened = function(fn, mainCallback) {
    this._eachRepo(fn, function(err, data) {
        mainCallback(err, _.flatten(data));
    });
};

Sprinter.prototype._fetchAllPages = function(fetchFunction, params, callback) {
    var client = this.gh
      , allPages = []
      , slug = params.user + '/' + params.repo;
    function getRemainingPages(lastPage, pageCallback) {
        allPages = allPages.concat(lastPage);
        if (client.hasNextPage(lastPage)) {
            client.getNextPage(lastPage, function(err, pageResults) {
                getRemainingPages(pageResults, pageCallback);
            });
        } else {
            // Attach a repo object to each result so users can tell what repo
            // it is coming from.
            _.each(allPages, function(item) {
                item.repo = slug;
            });
            pageCallback(null, allPages);
        }
    }
    fetchFunction(params, function(err, pageOneResults) {
        if (err) {
            callback(err);
        } else {
            getRemainingPages(pageOneResults, callback);
        }
    });
};

/**
 * Allows users to reset cache duration on a sprinter instance.
 * @param duration {int} seconds to cache results.
 */
Sprinter.prototype.setCacheDuration = function(duration) {
    // console.log('setting cache duration to %s', duration);
    this._cacheDuration = duration;
};

/**
 * Clears the cache.
 */
Sprinter.prototype.clearCache = function() {
    this._CACHE = {};
};

/*
 * Issues and PRs are almost the same thing in GitHub's API, so this is just
 * a convenience method to put all the logic in one place.
 */
Sprinter.prototype._getIssueOrPr = function(type, userFilters, mainCallback) {
    var me = this
      , defaultFilters = {state: 'open'}
      , filters
      , filterOrg
      , filterRepo
      , milestone
      , fetcher
      , resultHandler
      , getter;

    if (type == 'issue') {
        getter = this.gh.issues.repoIssues;
    } else {
        getter = this.gh.pullRequests.getAll
    }

    if (typeof(userFilters) == 'function' && mainCallback == undefined) {
        mainCallback = userFilters;
        userFilters = {};
    }
    filters = _.extend(defaultFilters, userFilters);
    if (filters.milestone) {
        milestone = filters.milestone;
        delete filters.milestone;
    }

    fetcher = function(org, repo, localCallback) {
        var fetchByState = {}
          , asyncErrors = []
          , localFilters = _.clone(filters);
        localFilters.user = org;
        localFilters.repo = repo;

        // This exists so we can populate an errors object from the async calls.
        // Otherwise if there is an error passed to the async callback, the
        // async module will stop executing remaining functions.
        function getFetchByStateCallback(callback) {
            return function(err, data) {
                if (err) {
                    asyncErrors.push(err);
                }
                callback(null, data);
            };
        }

        // This logic is to allow for a state other than 'open' and 'closed'.
        // The 'all' state should return both open and closed issues, which will
        // require async calls to to the API to get issues with each state.
        if (localFilters.state && localFilters.state == 'all') {
            var openStateFilter = _.clone(localFilters)
              , closedStateFilter = _.clone(localFilters);
            openStateFilter.state = 'open';
            closedStateFilter.state = 'closed';
            fetchByState[openStateFilter.state] = function(fetchCallback) {
                me._fetchAllPages(
                    getter
                  , openStateFilter
                  , getFetchByStateCallback(fetchCallback)
                );
            };
            fetchByState[closedStateFilter.state] = function(fetchCallback) {
                me._fetchAllPages(
                    getter
                  , closedStateFilter
                  , getFetchByStateCallback(fetchCallback)
                );
            };
        } else {
            fetchByState[localFilters.state] = function(fetchCallback) {
                me._fetchAllPages(
                    getter
                  , localFilters
                  , getFetchByStateCallback(fetchCallback)
                );
            };
        }
        async.parallel(fetchByState, function(err, allIssues) {
            // If there were no async errors, we'll use undefined instead of an
            // empty array to represent no errors.
            if (asyncErrors.length == 0) {
                asyncErrors = undefined;
            }
            // If state is 'all', we need to concat the open and closed issues
            // together.
            if (localFilters.state && localFilters.state == 'all') {
                allIssues = allIssues.open.concat(allIssues.closed);
            } else {
                allIssues = allIssues[localFilters.state];
            }
            localCallback(asyncErrors, allIssues)
        });
    };

    resultHandler = function(errors, result) {
        if (milestone) {
            result = _.filter(result, function(issue) {
                if (issue.milestone == null) { return false; }
                return issue.milestone.title == milestone;
            });
        } else {
            // If user specified a result format, apply it.
            if (userFilters.format) {
                result = formatIssues(userFilters.format, result);
            }
        }
        mainCallback(errors, sortIssues(result));
    };

    // If the user specified only one repository to query, we don't want to
    // query all the others.
    if (filters.repo) {
        filterOrg = filters.repo.split('/').shift();
        filterRepo = filters.repo.split('/').pop();
        fetcher(filterOrg, filterRepo, resultHandler);
    } else {
        this._eachRepoFlattened(fetcher, resultHandler);
    }
};

/**
 * Returns all issues across all monitored repos. Optional filters can be
 * provided to filter results.
 * @param [userFilters] {object} Filter, like {state: 'closed'}. This can also
 *                               contain a 'format' value to specify how the
 *                               issues should be presented. The only valid
 *                               option at this point is 'network', which will
 *                               break out "super" issues and "singleton" issues
 *                               and attaching super issue subtasks as
 *                               "subtasks" on the super issue object.
 *                               (A bit of an unadvertised feature of sprinter.)
 * @param mainCallback {function} Called with err, issues when done. Issues are
 *                                sorted by updated_at.
 */
Sprinter.prototype.getIssues = function(userFilters, mainCallback) {
    this._getIssueOrPr('issue', userFilters, mainCallback);
};

/**
 * Returns all prs across all monitored repos. Optional filters can be provided
 * to filter results, but they are more limited than getting issues.
 * @param [userFilters] {object} Filter, like {state: 'closed'}.
 * @param mainCallback {function} Called with err, prs when done. PRs are
 *                                sorted by updated_at.
 */
Sprinter.prototype.getPullRequests = function(userFilters, mainCallback) {
    this._getIssueOrPr('pr', userFilters, mainCallback);
};

/**
 * Returns all milestones across monitored repos, grouped by title. Useful for
 * standard milestone periods like sprints.
 * @param mainCallback {function} Called with err, milestones.
 */
Sprinter.prototype.getMilestones = function(mainCallback) {
    var me = this;
    this._eachRepoFlattened(function(org, repo, localCallback) {
        me._fetchAllPages(
            me.gh.issues.getAllMilestones
          , {user: org, repo: repo}
          , localCallback
        );
    }, function(err, milestones) {
        mainCallback(
            attachReadableErrorMessages(err)
          , _.groupBy(milestones, 'title')
        );
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
                        me.gh.issues.updateMilestone(
                            { user: splitSlug[0]
                            , repo: splitSlug[1]
                            , number: match.number
                            , title: match.title
                            , state: 'closed'
                            }
                          , localCallback
                        );
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
            user: org
          , repo: repo
        }, milestone);
        me.gh.issues.createMilestone(payload, localCallback);
    }, function(err, response) {
        mainCallback(attachReadableErrorMessages(err), response);
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
            user: org
          , repo: repo
        };
        me._fetchAllPages(me.gh.issues.getAllMilestones, payload, 
            function(err, milestones) {
                var slug = org + '/' + repo;
                if (err) {
                    localCallback(err);
                } else {
                    var match = _.find(milestones, function(milestone) {
                            return milestone.title == title;
                        })
                      , result = undefined;
                    if (match) {
                        result = {
                            repo: slug
                          , number: match.number
                        }
                    }
                    localCallback(null, result);
                }
            }
        );
    }, function(err, milestonesToUpdate) {
        if (err) {
            mainCallback(attachReadableErrorMessage(err));
        } else {
            me._eachRepo(function(org, repo, milestoneUpdateCallback) {
                var slug = org + '/' + repo
                  , milestoneToUpdate = _.find(
                        milestonesToUpdate
                      , function(ms) {
                            return ms && ms.repo == slug;
                        }
                    )
                  , payload = undefined;
                if (milestoneToUpdate) {
                    payload = _.extend({
                        user: org
                      , repo: repo
                      , number: milestoneToUpdate.number
                    }, milestone);
                    me.gh.issues.updateMilestone(
                        payload
                      , function(err, result) {
                          if (err) {
                              err.repo = org + '/' + repo;
                              milestoneUpdateCallback(err);
                          } else {
                              milestoneUpdateCallback(err, result);
                          }
                      }
                    );
                }
            }, mainCallback);
        }
    });
};

/**
 * Creates the same labels across all monitored repos.
 * @param labels {Array} Should be a list of objects, each with a name and hex 
 *                       color (without the #).
 * @param mainCallback {function} Called with err, created labels.
 */
Sprinter.prototype.createLabels = function(labels, mainCallback) {
    var me = this;
    this._eachRepo(function(org, repo, localCallback) {
        var createFunctions = _.map(labels, function(labelSpec) {
            var payload = _.extend({
                user: org
              , repo: repo
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
        me._fetchAllPages(
            me.gh.issues.getLabels, {user: org, repo: repo}, localCallback
        );
    }, function(err, labels) {
        mainCallback(attachReadableErrorMessages(err), labels);
    });
};

/**
 * Returns all collaborators across monitored repos.
 * @param mainCallback {function} Called with err, collaborators.
 */
Sprinter.prototype.getCollaborators = function(mainCallback) {
    var me = this;
    this._eachRepoFlattened(function(org, repo, localCallback) {
        me._fetchAllPages(
            me.gh.repos.getCollaborators, {user: org, repo: repo}, localCallback
        );
    }, function(err, collaborators) {
        mainCallback(
            attachReadableErrorMessages(err)
          , deduplicateCollaborators(collaborators)
        );
    });
};

/* Stashes original prototype functions of Sprinter for use in caching. */
_.each(Sprinter.prototype, function(fn, name) {
    if (name.indexOf('get') == 0) {
        originalPrototypeFunctions[name] = fn;
    }
});

module.exports = Sprinter;
