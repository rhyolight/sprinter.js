# Untitled

Provides some extended utilities for the Github API for operating against multiple Github issue trackers at once.

If you're like me, this library might save you an hour a week. I'm a "scrum master", which sounds silly but is actually a real thing. We have a lot of [repos on Github](https://github.com/numenta/). Most of them have issue trackers. So it takes a long time to update all of them for common recurring tasks like sprint changes. This library takes your github credentials [2] and gives you easy ways to set up tasks that executie against multiple Github Issue Trackers at once, so you can:

Run the following actions across multiple repos:

- list issues 
- create milestones 
- close  milestones 

[1]
[2] Is this a bad thing? Should I be using a different authentication method? If so, [please file a bug](https://github.com/rhyolight/octoshoes/issues). 

## Examples

### Creating the Client

var OctoshoeClient = require('./OctoshoeClient');

    var client = new OctoshoeClient(
        <username>,
        <password>,
        ['org1/repo1', 'org1/repo2', 'org2/repo1']
    );

### Listing All Issues Across All Repos

    client.getIssues(function(err, issues) {
        console.log(issues);
    });

### Listing All Milestones Across All Repos

    client.getMilestones(function(err, milestones) {
        console.log(milestones);
    });

Milestones will be grouped by title.

### Closing Milestones by Title Across All Repos

Closes all milestones with the title `Sprint 18` across all monitored repos.

    client.closeMilestones('Sprint 18', function(err, closed) {
        console.log('CLOSED MILESTONES:');
        console.log(closed);
    });
