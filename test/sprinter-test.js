var _ = require('lodash')
  , assert = require('chai').assert,
    expect = require('chai').expect,
    mockNupicIssues = require('./mock-data/nupic-issues'),
    mockSprinterIssues = require('./mock-data/sprinter-issues'),
    mockSprinterPrs = require('./mock-data/sprinter-prs'),
    mockSprinterPrIssues = require('./mock-data/sprinter-pr-issues'),
    mockSprinterClosedIssues = require('./mock-data/sprinter-closed-issues'),
    mockSprinterDashIssues = require('./mock-data/sprinter-dash-issues'),
    mockSprinterDashClosedIssues = require('./mock-data/sprinter-dash-closed-issues'),
    mockNumentaMilestonesCreated = require('./mock-data/numenta-milestone-created'),
    mockRhyolightMilestonesCreated = require('./mock-data/rhyolight-milestone-created'),
    mockNupicLabels = require('./mock-data/nupic-labels'),
    mockSprinterLabels = require('./mock-data/sprinter-labels'),
    mockNupicCollaborators = require('./mock-data/nupic-collaborators'),
    mockSprinterCollaborators = require('./mock-data/sprinter-collaborators'),
    mockMixedSuperSubIssues = require('./mock-data/mixed-super-sub-issues'),
    proxyquire = require('proxyquire');

function assertNoErrors(err) {
    expect(err).to.be.undefined;
}

function assertErrorMessageEquals(err, message) {
    expect(err).to.be.instanceOf(Object, 'Got ' + typeof(err) + ' instead of Object');
    expect(err).to.have.length(1);
    expect(err[0]).to.include.keys('message', 'code', 'repo');
    expect(err[0].message).to.equal(message)
}

describe('sprinter', function() {

    describe('when constructed', function() {
        var authenticated = false;
        var mockGitHubInstance = {
            authenticate: function(params) {
                assert.equal('basic', params.type, 'Missing GitHub auth type during authentication.');
                assert.equal('my-username', params.username, 'Missing GitHub username during authentication.');
                assert.equal('my-password', params.password, 'Missing GitHub password during authentication.');
                authenticated = true;
            }
        };

        var Sprinter = proxyquire('../lib/sprinter', {
            'github': function () {
                return mockGitHubInstance;
            }
        });

        describe('without username', function() {
            it('throws proper error', function() {
                expect(function() {
                    new Sprinter(undefined, 'my-password');
                }).to.throw('Missing username.');
            });
        });

        describe('without password', function() {
            it('throws proper error', function() {
                expect(function() {
                    new Sprinter('my-username');
                }).to.throw('Missing password.');
            });
        });

        describe('without repos', function() {
            it('throws proper error', function() {
                expect(function() {
                    new Sprinter('my-username', 'my-password');
                }).to.throw('Missing repositories.');
            });
        });

        describe('with required configuration', function() {

            it('authenticates through GitHub', function() {
                new Sprinter('my-username', 'my-password', ['repo1','repo2']);
                assert.ok(authenticated, 'Sprinter did not authenticate upon construction.');
            });

        });

        describe('with multiple instances', function() {
            it('keeps instance properties separated by instance', function() {
                var s1 = new Sprinter('my-username', 'my-password', ['repo/1','repo/2']);
                var s2 = new Sprinter('my-username', 'my-password', ['repo/3','repo/4']);
                expect(s1.repos).to.not.equal(s2.repos);
            });
        });

    });

    describe('when fetching issues or pull requests', function() {

        describe('when fetching issues', function() {
            var callbackCount = 0
              , mockGitHubInstance = {
                    authenticate: function() {},
                    hasNextPage: function() { return false; },
                    issues: {
                        repoIssues: function(params, callback) {
                            // Error case when repo does not exist
                            if (params.repo == 'does not exist') {
                                return callback({
                                    message: '{"message":"Not Found","documentation_url":"https://developer.github.com/v3"}',
                                    code: 404
                                });
                            }
                            // Error case when repo has no issue tracker
                            else if (params.repo == 'no tracker') {
                                return callback({
                                    message: '{"message":"Issues are disabled for this repo","documentation_url":"https://developer.github.com/v3/issues/"}',
                                    code: 410
                                });
                            }
                            expect(params).to.be.instanceOf(Object, 'GitHub client given no parameters.');
                            expect(params).to.include.keys('user', 'repo', 'state');
                            assert.includeMembers(['numenta', 'rhyolight'], [params.user], 'Repo user should be either numenta or rhyolight.');
                            assert.includeMembers(['nupic', 'sprinter.js'], [params.repo], 'Repo name should be either nupic or sprinter.js.');
                            expect(params.state).to.equal('open', 'Default state filter was not "open".');
                            if (params.format && params.format == 'network') {
                                // Just a hack to return only one copy of the mock issues.
                                if (callbackCount++ == 0) {
                                    callback(null, []);
                                } else {
                                    callback(null, mockMixedSuperSubIssues);
                                }
                            } else if (params.user == 'numenta' && params.repo == 'nupic') {
                                callback(null, mockNupicIssues);
                            } else if (params.user == 'rhyolight' && params.repo == 'sprinter.js') {
                                callback(null, mockSprinterIssues);
                            } else {
                                assert.fail('Unknown repo "' + params.user + '/' + params.repo + '".');
                            }
                        }
                    }
                };

            var Sprinter = proxyquire('../lib/sprinter', {
                'github': function () {
                    return mockGitHubInstance;
                }
            });

            it('fetches issues from all repos', function(done) {
                var sprinter = new Sprinter('user', 'pass', ['numenta/nupic','rhyolight/sprinter.js']);

                sprinter.getIssues(function(err, issues) {
                    assertNoErrors(err);
                    expect(issues).to.have.length(33, 'Wrong length of returned issues.');
                    done();
                });
            });

            describe('when issue state is "all"', function() {
                var mockGitHubInstance = {
                    authenticate: function() {},
                    hasNextPage: function() { return false; },
                    issues: {
                        repoIssues: function(params, callback) {
                            expect(params).to.be.instanceOf(Object, 'GitHub client given no parameters.');
                            expect(params).to.include.keys('user', 'repo', 'state');
                            assert.includeMembers(['numenta', 'rhyolight'], [params.user], 'Repo user should be either numenta or rhyolight.');
                            if (params.repo == 'sprinter.js') {
                                if (params.state == 'open') {
                                    callback(null, mockSprinterIssues)
                                } else if (params.state == 'closed') {
                                    callback(null, mockSprinterClosedIssues);
                                } else {
                                    assert.fail('Unknown issue state "' + params.state + '"');
                                }
                            } else if (params.repo == 'sprinter-dash') {
                                if (params.state == 'open') {
                                    callback(null, mockSprinterDashIssues)
                                } else if (params.state == 'closed') {
                                    callback(null, mockSprinterDashClosedIssues);
                                } else {
                                    assert.fail('Unknown issue state "' + params.state + '"');
                                }
                            } else {
                                assert.fail('Unknown repo "' + params.repo + '"');
                            }
                        }
                    }
                };
                var Sprinter = proxyquire('../lib/sprinter', {
                    'github': function () {
                        return mockGitHubInstance;
                    }
                });
                describe('and only one repo', function() {
                    it('fetches both open and closed issues', function(done) {
                        var sprinter = new Sprinter('user', 'pass', ['rhyolight/sprinter.js']);
                        sprinter.getIssues({state: 'all'}, function(err, issues) {
                            assertNoErrors(err);
                            expect(issues[0]).to.have.property('repo');
                            expect(issues[0].repo).to.equal('rhyolight/sprinter.js');
                            // Expecting 3 open, 5 closed
                            expect(issues).to.have.length(8, 'Wrong length of returned issues.');
                            done();
                        });

                    });
                });
                describe('for many repos', function() {
                    it('fetches both open and closed issues', function(done) {
                        var sprinter = new Sprinter('user', 'pass', ['rhyolight/sprinter.js', 'rhyolight/sprinter-dash']);
                        sprinter.getIssues({state: 'all'}, function(err, issues) {
                            assertNoErrors(err);
                            expect(issues[0]).to.have.property('repo');
                            expect(issues[0].repo).to.equal('rhyolight/sprinter.js');
                            // Expecting 3 open, 5 closed in sprinter.js and
                            // 5 open, 1 closed from sprinter-dash, totalling 14 total
                            expect(issues).to.have.length(14, 'Wrong length of returned issues.');
                            done();
                        });

                    });
                });
            });

            it('attaches a repo to each issue', function(done) {
                var sprinter = new Sprinter('user', 'pass', ['numenta/nupic','rhyolight/sprinter.js']);
                sprinter.getIssues(function(err, issues) {
                    assertNoErrors(err);
                    expect(issues[0]).to.have.property('repo');
                    expect(issues[0].repo).to.equal('rhyolight/sprinter.js');
                    done();
                });
            });

            it('handles errors when repo does not exist', function(done) {
                var sprinter = new Sprinter('user', 'pass', ['numenta/does not exist']);

                sprinter.getIssues(function(err) {
                    assertErrorMessageEquals(err, 'Unknown repository: "numenta/does not exist"');
                    done();
                });
            });

            it('handles errors when repo has no issue tracker', function(done) {
                var sprinter = new Sprinter('user', 'pass', ['numenta/no tracker']);

                sprinter.getIssues(function(err) {
                    assertErrorMessageEquals(err, '"numenta/no tracker" has no GitHub Issues associated with it.');
                    done();
                });
            });

            describe('when a repo parameter is specified', function() {
                it('only queries one issue tracker', function(done) {
                    var sprinter = new Sprinter('user', 'pass', ['numenta/nupic','rhyolight/sprinter.js']);

                    sprinter.getIssues({repo: 'rhyolight/sprinter.js'}, function(err, issues) {
                        assertNoErrors(err);
                        expect(issues).to.have.length(3, 'Wrong length of returned issues.');
                        done();
                    });
                });
            });

            describe('and "network" issue format is specified', function() {
                it('issues are grouped into super tasks with subtasks and singletons', function(done) {
                    var sprinter = new Sprinter('user', 'pass', ['numenta/nupic','rhyolight/sprinter.js']);

                    sprinter.getIssues({format: 'network'}, function(err, issues) {
                        assertNoErrors(err);
                        expect(issues).to.be.instanceOf(Object, 'Got ' + typeof(issues) + ' instead of Object');
                        expect(issues).to.include.keys('supers', 'singletons', 'all');
                        expect(issues.all).to.have.length(28, 'Wrong length of returned total issues.');
                        expect(issues.supers).to.have.length(2, 'Wrong length of returned super issues.');

                        // Each super issue should have sub issues
                        _.each(issues.supers, function(superIssue) {
                            expect(superIssue).to.include.keys('subtasks');
                        });

                        expect(issues.singletons).to.have.length(20, 'Wrong length of returned singleton issues.');
                        done();
                    });
                });
            });

        });

        describe('when fetching pull requests', function() {
            var mockGitHubInstance = {
                authenticate: function () {
                },
                hasNextPage: function () {
                    return false;
                },
                issues: {
                    repoIssues: function(params, callback) {
                        callback(null, mockSprinterPrIssues);
                    }
                },
                pullRequests: {
                    getAll: function(params, callback) {
                        callback(null, mockSprinterPrs)
                    }
                }
            };

            var Sprinter = proxyquire('../lib/sprinter', {
                'github': function () {
                    return mockGitHubInstance;
                }
            });

            var sprinter = new Sprinter('user', 'pass', ['rhyolight/sprinter.js']);

            describe('and mergeIssuesIntoPrs is specified', function() {
                it('merges issue details into PR objects', function(done) {

                    sprinter.getPullRequests({
                        mergeIssueProperties: true
                    }, function(err, prs) {
                        assertNoErrors(err);
                        //console.log(prs);
                        expect(prs).to.have.length(1, 'Wrong length of returned PRs.');
                        expect(prs[0]).to.have.property('labels');
                        done();
                    });


                });

            });
        });

    });

    describe('when creating milestones', function() {
        var mockGitHubInstance = {
            authenticate: function() {},
                issues: {
                    createMilestone: function(params, callback) {
                        expect(params).to.be.instanceOf(Object, 'GitHub client given no parameters.');
                        expect(params).to.have.keys('user', 'repo', 'title', 'due_on');
                        assert.includeMembers(['numenta', 'rhyolight'], [params.user], 'Repo user should be either numenta or rhyolight.');
                        expect(params.repo).to.equal('experiments');
                        expect(params.title).to.equal('Test Milestone');
                        expect(params.due_on).to.equal('Apr 16, 2015');
                        if (params.user == 'rhyolight' && params.repo == 'experiments') {
                            callback(null, mockRhyolightMilestonesCreated);
                        } else if (params.user == 'numenta' && params.repo == 'experiments') {
                            callback(null, mockNumentaMilestonesCreated);
                        } else {
                            assert.fail('Unknown repo "' + params.user + '/' + params.repo + '".');
                        }
                    }
                }
        };

        var Sprinter = proxyquire('../lib/sprinter', {
            'github': function () {
                return mockGitHubInstance;
            }
        });

        it('creates milestone on each repo', function(done) {
            var sprinter = new Sprinter('user', 'pass', ['numenta/experiments','rhyolight/experiments']);
            sprinter.createMilestones({
                title: 'Test Milestone',
                due_on: 'Apr 16, 2015'
            }, function(err, milestones) {
                assertNoErrors(err);
                expect(milestones).to.have.length(2, 'Wrong length of returned milestones.');
                done();
            });
        });

    });

    describe('when fetching labels', function() {
        var mockGitHubInstance = {
            authenticate: function() {},
            hasNextPage: function() { return false; },
            issues: {
                getLabels: function(params, callback) {
                    expect(params).to.be.instanceOf(Object, 'GitHub client given no parameters.');
                    expect(params).to.include.keys('user', 'repo');
                    assert.includeMembers(['numenta', 'rhyolight'], [params.user], 'Repo user should be either numenta or rhyolight.');
                    assert.includeMembers(['nupic', 'sprinter.js'], [params.repo], 'Repo name should be either nupic or sprinter.js.');
                    if (params.user == 'numenta' && params.repo == 'nupic') {
                        callback(null, mockNupicLabels);
                    } else if (params.user == 'rhyolight' && params.repo == 'sprinter.js') {
                        callback(null, mockSprinterLabels);
                    } else {
                        assert.fail('Unknown repo "' + params.user + '/' + params.repo + '".');
                    }
                }
            }
        };

        var Sprinter = proxyquire('../lib/sprinter', {
            'github': function () {
                return mockGitHubInstance;
            }
        });

        it('fetches labels from all repos', function(done) {
            var sprinter = new Sprinter('user', 'pass', ['numenta/nupic','rhyolight/sprinter.js']);

            sprinter.getLabels(function(err, labels) {
                assertNoErrors(err);
                expect(labels).to.have.length(mockNupicLabels.length + mockSprinterLabels.length, 'Wrong length of returned labels.');
                done();
            });
        });

        it('attaches a repo to each label', function(done) {
            var sprinter = new Sprinter('user', 'pass', ['numenta/nupic','rhyolight/sprinter.js']);

            sprinter.getLabels(function(err, labels) {
                assertNoErrors(err);
                expect(labels[0]).to.have.property('repo');
                expect(labels[0].repo).to.equal('numenta/nupic');
                done();
            });
        });

    });

    describe('when fetching collaborators', function() {
        var mockGitHubInstance = {
            authenticate: function() {},
            hasNextPage: function() { return false; },
            repos: {
                getCollaborators: function(params, callback) {
                    expect(params).to.be.instanceOf(Object, 'GitHub client given no parameters.');
                    expect(params).to.include.keys('user', 'repo');
                    assert.includeMembers(['numenta', 'rhyolight'], [params.user], 'Repo user should be either numenta or rhyolight.');
                    assert.includeMembers(['nupic', 'sprinter.js'], [params.repo], 'Repo name should be either nupic or sprinter.js.');
                    if (params.user == 'numenta' && params.repo == 'nupic') {
                        callback(null, mockNupicCollaborators);
                    } else if (params.user == 'rhyolight' && params.repo == 'sprinter.js') {
                        callback(null, mockSprinterCollaborators);
                    } else {
                        assert.fail('Unknown repo "' + params.user + '/' + params.repo + '".');
                    }
                }
            }
        };

        var Sprinter = proxyquire('../lib/sprinter', {
            'github': function () {
                return mockGitHubInstance;
            }
        });

        it('fetches collaborators from all repos', function(done) {
            var sprinter = new Sprinter('user', 'pass', ['numenta/nupic','rhyolight/sprinter.js']);

            sprinter.getCollaborators(function(err, issues) {
                // Minus one because "rhyolight" is in both lists and we don't want duplicates.
                var expectedLength = mockNupicCollaborators.length + mockSprinterCollaborators.length - 1;
                assertNoErrors(err);
                expect(issues).to.have.length(expectedLength, 'Wrong length of returned collaborators.');
                done();
            });
        });

    });

});
