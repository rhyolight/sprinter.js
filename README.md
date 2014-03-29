# Octoshoes

Provides some utilities against the Github API for operating against multiple Github issue trackers at once.

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
