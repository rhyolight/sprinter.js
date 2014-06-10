# Sprinter

<table>
<tr>
  <td>
    <img src="http://maxcdn.fooyoh.com/files/attach/images/591/736/904/004/haters_gonna_hate.gif"/>
  </td>
  <td>
    <p/>Provides some extended utilities for the Github API for operating against <strong>multiple Github issue trackers at once</strong>.
  </td>
</tr>
</table>

If you're like me, this library might save you an hour a week. I'm a "scrum master", which sounds silly but is actually a real thing. <a href="https://github.com/numenta/">We have a lot of repos on Github</a>. Most of them have issue trackers. So it takes a long time to update all of them for common recurring tasks like sprint changes. This library takes your Github credentials [2] and gives you easy ways to set up tasks that execute against multiple Github Issue Trackers at once, so you can:

Run the following actions across multiple repos:

- list issues
- list milestones
- create milestones
- close  milestones


[1] There is no [1].

[2] Should I be using a different authentication method? If so, [please file a bug](https://github.com/rhyolight/sprinter.js/issues).

## Example Usage

Sprinter is used as the backend to report on issues across all the repositories in the [Numenta Github Organization](https://github.com/numenta/) on our [status board](http://status.numenta.org/issues.html).

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
    Environment variables with the Github username and password for API calls:
        GH_USERNAME=<username>
        GH_PASSWORD=<password>

    USAGE
        sprinter <command> <cmd-options> --repo=org/repo,org2/repo2
     or
        sprinter <command> <cmd-options> --repo=./path/to/repo/file

    The repo file should have one repo slug on each line.

    COMMANDS
    listIssues
        Prints all issues.
    listMilestones
        Prints all milestones.
    createMilestones <title> <due_on>
        Creates new milestone in each repo with given title and due date.
        `due_on` should be a JS-formattable date string like 'Apr 16, 2014'.
    closeMilestones <title>
        Closes all milestones matching title across all repos.

    EXAMPLE
    sprinter createMilestones "Sprint 43" "April 16, 2014" --repo=rhyolight/highlinker,rhyolight/chesster

## CLI Usage

1. Create a file with a list of repositories you want to use sprinter against. It should look something like mine:

    #### `nupic-repos.txt`
        numenta/nupic
        numenta/nupic.cerebro
        numenta/nupic.documents
        numenta/nupic.core
        numenta/nupic.fluent
        numenta/nupic.fluent.server
        numenta/nupic-linux64
        numenta/nupic-darwin64
        numenta/pycept
        numenta/nupic.tools
        numenta/nupic.wallboard
        numenta/numenta.org

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

### Closing Milestones by Title Across All Repos

Closes all milestones with the title `Sprint 18` across all monitored repos.

    sprinter.closeMilestones('Sprint 18', function(err, closed) {
        console.log('Closed milestones:');
        console.log(closed);
    });
