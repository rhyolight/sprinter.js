var _ = require('underscore')
  , moment = require('moment');
require('colors');

function shorten(msg, length) {
    if (! length) { length = 75; }
    var shortened = msg.substr(0, length);
    if (shortened.length == length) {
        shortened += '...';
    }
    return shortened;
}

function formatIssue(issue) {
    var labels = issue.labels.map(function(label) {
        return label.name.grey;
    }).join(', '), assignee = 'None';
    if (issue.assignee) {
        assignee = issue.assignee.login;
    }
    if (! labels) {
        labels = "<<NO LABELS>>".magenta;
    }
    console.log('  ' + ('★' + shorten(issue.title)).bold.cyan);
    console.log('    assignee : ' + assignee
        + ' (' + labels + ')');
    console.log('    created  : ' + moment(issue.created_at).calendar().red
        + '   updated: ' + moment(issue.updated_at).calendar().red);
    console.log('    ' + issue.html_url.blue);
}

function formatIssues(issues) {
    var grouped = _.groupBy(issues, function(issue) {
        var milestone = issue.milestone;
        if (milestone && milestone != 'null') {
            return milestone.title;
        } else {
            return 'Backlog';
        }
    });
    _.each(grouped, function(issues, milestone) {
        var byProject = _.groupBy(issues, function(issue) {
            return issue.repo;
        });
        console.log('\n' + milestone.bold.underline.blue
            + ' (' + issues.length + ')');
        _.each(byProject, function(projectIssues, repo) {
            console.log(repo.yellow + ' (' + projectIssues.length + ')');
            _.each(projectIssues, formatIssue);
        });
    });
    console.log('\n' + issues.length + ' total issues.');
}

function formatMilestone(milestones, title) {
    // console.log(typeof(milestone));
    // console.log((milestone));
    console.log('\n' + title.bold.blue);
    _.each(milestones, function(milestone) {
        // console.log(_.keys(milestone));
        console.log('  ' + milestone.repo.yellow
            + (' https://github.com/' + milestone.repo + '/issues').blue
            + '\n  (' + (milestone.open_issues + ' open').cyan + ') due '
            + moment(milestone.due_on).calendar().red);
    });
}

function formatMilestones(milestones) {
    // console.log(milestones)
    _.each(milestones, formatMilestone);
}

function formatLabels(labels) {
    _.each(_.groupBy(labels, 'repo'), function(repoLabels, repo) {
        console.log('\n' + repo.bold.blue);
        console.log(_.map(repoLabels, function(label) {
            return label.name;
        }).join(', '));
    });
}

function formatCollaborators(collaborators) {
    _.each(_.groupBy(collaborators, 'repo'), function(repoCollaborators, repo) {
        console.log('\n' + repo.bold.blue);
        _.each(repoCollaborators, function(collaborator) {
            console.log('  ' + collaborator.login.yellow
                + ' ' + collaborator.html_url.blue);
        });
    });
}

module.exports = {
    formatIssue: formatIssue
  , formatIssues: formatIssues
  , formatMilestone: formatMilestone
  , formatMilestones: formatMilestones
  , formatLabels: formatLabels
  , formatCollaborators: formatCollaborators
};
