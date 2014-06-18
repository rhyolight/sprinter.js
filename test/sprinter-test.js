var assert = require('chai').assert,
    expect = require('chai').expect,
    proxyquire = require('proxyquire');

describe('sprinter', function() {

    describe('when constructed', function() {
        var authenticated = false;
        var mockGithubInstance = {
            authenticate: function(params) {
                assert.equal('basic', params.type, 'Missing Github auth type during authentication.');
                assert.equal('my-username', params.username, 'Missing Github username during authentication.');
                assert.equal('my-password', params.password, 'Missing Github password during authentication.');
                authenticated = true;
            }
        };

        var Sprinter = proxyquire('../sprinter', {
            'github': function () {
                return mockGithubInstance;
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

            it('authenticates through Github', function() {
                new Sprinter('my-username', 'my-password', ['repo1','repo2']);
                assert.ok(authenticated, 'Sprinter did not authenticate upon construction.');
            });

        });

    });

});
