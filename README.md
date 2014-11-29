# Sprinter [![Build Status](https://travis-ci.org/rhyolight/sprinter.js.svg?branch=master)](https://travis-ci.org/rhyolight/sprinter.js) [![Coverage Status](https://coveralls.io/repos/rhyolight/sprinter.js/badge.png?branch=master)](https://coveralls.io/r/rhyolight/sprinter.js?branch=master) [![NPM version](https://badge.fury.io/js/sprinter.svg)](http://badge.fury.io/js/sprinter)

<table>
<tr>
  <td>
    <img src="http://maxcdn.fooyoh.com/files/attach/images/591/736/904/004/haters_gonna_hate.gif"/>
  </td>
  <td>
    <p/>Provides some extended utilities for the GitHub API for operating against <strong>multiple GitHub issue trackers at once</strong>.
  </td>
</tr>
</table>

If you're like me, this library might save you an hour a week. I'm a "scrum master", which sounds silly but is actually a real thing. <a href="https://github.com/numenta/">We have a lot of repos on GitHub</a>. Most of them have issue trackers. So it takes a long time to update all of them for common recurring tasks like sprint changes. This library takes your GitHub credentials and gives you easy ways to set up tasks that execute against multiple GitHub Issue Trackers at once, so you can:

Run the following actions across multiple repos:

- list issues
- list milestones
- create milestones
- close  milestones
- update milestones
- create labels
- list labels
- list collaborators

## Need a UI?

Use [sprinter-dash](https://github.com/rhyolight/sprinter-dash)!

## Example Usage

Sprinter is used as the backend to report on issues across all the repositories in the [Numenta GitHub Organization](https://github.com/numenta/) on our [status board](http://status.numenta.org/issues).

## Installation

### As a library for local scripts

    npm install sprinter

Now you can `require('sprinter')` and use as defined below in the [examples](#examples-of-using-as-a-library).

### As a command line tool

    npm install -g sprinter

Now you can run `sprinter` from the command line.

    sprinter --help

Displays usage information.

    Sprinter CLI Tool: Utilities for operating on issue trackers of several repositories at once.

    REQUIREMENTS
    Environment variables with the GitHub username and personal access token (NOT your master password) for API calls:
        GH_USERNAME=<username>
        GH_PASSWORD=<personal access token>
    Create a personal access token for sprinter.js at https://github.com/settings/applications -> 'Generate token' with 'repo', 'public_repo', and 'repo:status' checked.

    USAGE
        sprinter <command> <cmd-options> --repos=org/repo,org2/repo2
     or
        sprinter <command> <cmd-options> --repos=./path/to/repo/file

    The repo file should have one repo slug on each line. Instead of providing a --repos option, you could
    set the $SPRINTER_REPOS environment variable instead.

    COMMANDS
    printRepos
        Prints the repositories Sprinter is configured to run against.
    listIssues [--milestone="milestone name"] [--state="open/closed/all"]
        [--assignee="github username"]
        Prints all issues. Optionally filters by milestone name, assignee, or state.
    listMilestones
        Prints all milestones.
    listLabels
        Prints all labels.
    listCollaborators
        Prints all collaborators.
    createMilestones <title> <due_on>
        Creates new milestone in each repo with given title and due date.
        `due_on` should be a JS-formattable date string like 'Apr 16, 2014'.
    closeMilestones <title>
        Closes all milestones matching title across all repos.
    updateMilestones <title> <new-title> [due_on]
        Updates all milestones matching title across all repos.

    EXAMPLE
    sprinter createMilestones "Sprint 43" "April 16, 2014" --repos=rhyolight/highlinker,rhyolight/chesster

> **WARNING:** The CLI is not complete. There are some functions within the library that are not exposed as CLI functions.

## CLI Usage

1. Create a file with a list of repositories you want to use sprinter against. It should look something like mine:

    #### `nupic-repos.txt`
    
        numenta/nupic
        numenta/nupic.cerebro
        numenta/nupic.documents
        # You can add comments 
        numenta/nupic.core
        numenta/nupic.fluent
        numenta/nupic.fluent.server
        numenta/nupic-linux64
        numenta/nupic-darwin64
        
        # Whitespace between lines is okay
        
        numenta/pycept
        numenta/nupic.tools
        numenta/nupic.wallboard
        numenta/numenta.org
        
    You can also provide the list of repositories directly with the `--repos` option:
    
        $> sprinter listIssues --milestone="Sprint 19" --repos=org1/repo1,org1/repo2
    
    If you don't want to always specify the `--repos` option, set the same value into the `$SPRINTER_REPOS` environment variable. If `--repos` is not given with a CLI command, the `$SPRINTER_REPOS` value will be used instead.

1. Run sprinter commands with the `--repos=` option, pointing to the file.

        $> sprinter listIssues --milestone="Sprint 19" --repos=nupic-repos.txt

    ![Sprinter Sample Output](https://s3-us-west-2.amazonaws.com/public.numenta.org/images/sprinter.png)

1. Run with `--help` for more commands and options.

## Examples Of Using as a Library

### Creating the Client

    var Sprinter = require('sprinter');

    var sprinter = new Sprinter(
        <username>,
        <password>,
        ['org1/repo1', 'org1/repo2', 'org2/repo1']
    );

### Listing All Issues Across All Repos

    sprinter.getIssues(function(err, issues) {
        console.log(issues);
    });
    
#### Using API Filters

You can use any API query params that the GitHub API supports when making queries by add a query object, like this:

    sprinter.getIssues({assignee: 'rhyolight'}, function(err, issues) {
        console.log(issues);
    });
    
In addition to the regular GitHub API queries, you can also add `{repo: '<org>/<repo>'}`, which will prevent Sprinter from querying all the monitored repositories and focus on just one repo.

    sprinter.getIssues({
        assignee: 'rhyolight'
      , repo: 'numenta/nupic'
    }, function(err, issues) {
        console.log(issues);
    });
    
This will only query the `numenta/nupic` repository and return issues assigned to @rhyolight.

For `getIssues`, you may also use `{state: 'all'}` to get both `open` and `closed` issues.

### Listing All Pull Requests Across All Repos

    sprinter.getPullRequests(function (err, issues) {
       if (err) { return console.log(err); }
       _.each(issues, function(issue) {
           console.log('%s: (%s) %s', issue.id, issue.repo, issue.title);
       });
    });

### Listing All Milestones Across All Repos

Milestones will be grouped by title.

    sprinter.getMilestones(function(err, milestones) {
        console.log(milestones);
    });

### Creating A Milestone Across All Repos

    sprinter.createMilestones({
        title: 'Sprint 20',
        due_on: 'Apr 16, 2014'
    }, function(err, milestones) {
        console.log(milestones);
    });

### Updating A Milestone Across All Repos

Provide a milestone title and new milestone properties, and you can update all milestones with that name across every repository.

    sprinter.updateMilestones('Milestone name to update', {
        title: 'New milestone name',
        due_on: 'May 5, 2015',
        description: 'New milestone description'
    }, function(err, milestones) {
        console.log(milestones);
    });

### Closing Milestones by Title Across All Repos

Closes all milestones with the title `Sprint 18` across all monitored repos.

    sprinter.closeMilestones('Sprint 18', function(err, closed) {
        console.log('Closed milestones:');
        console.log(closed);
    });

### Creating Labels Across All Repos

    var labels = [
        {
            name: "cleanup",
            color: "c7def8"
        },
        {
            name: "newbie",
            color: "bfe5bf"
        },
        {
            name: "tests",
            color: "fad8c7"
        }
    ]
    
    sprinter.createLabels(labels, function (err, labels) {
        console.log(labels);
    });

### List Labels Across All Repos

    sprinter.getLabels(function (err, labels) {
        console.log(labels);
    });
    
### List Collaborators Across All Repos

    sprinter.getCollaborators(function (err, collaborators) {
        console.log(err);
        console.log(collaborators.length);
    });
