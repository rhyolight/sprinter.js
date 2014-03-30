var _ = require('underscore'),
    moment = require('moment');
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
    });
    console.log('  ' + ('★' + shorten(issue.title)).bold.cyan);
    console.log('    author : ' + issue.user.login.magenta
        + ' (' + labels.join(', ') + ')');
    console.log('    created: ' + moment(issue.created_at).calendar().red 
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

function formatMilestone(milestone) {
    // console.log(typeof(milestone));
    // console.log((milestone));
    console.log(milestone.title.blue);
}

function formatMilestones(milestones) {

}

module.exports = {
    formatIssue: formatIssue,
    formatIssues: formatIssues,
    formatMilestone: formatMilestone,
    formatMilestones: formatMilestones
};