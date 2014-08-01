#!/usr/bin/env node
var fs = require('fs'),
    _ = require('underscore'),
    Sprinter = require('../sprinter'),
    formatter = require('./cli-output-format'),
    argv = require('minimist')(process.argv.slice(2)),
    sprinter,
    availableCommands,
    command, commandArgs, kwargs,
    githubUsername, githubPassword,
    monitoredRepos;

availableCommands = {
    printRepos: printReposCli,
    listIssues: getIssuesCli,
    listMilestones: getMilestonesCli,
    createMilestones: createMilestonesCli,
    closeMilestones: closeMilestonesCli,
    updateMilestones: updateMilestonesCli
};

availableCommands.listIssues.help       = "listIssues [--milestone=\"milestone name\"] "
    + "[--assignee=\"github username\"]\n\t".cyan
    + "Prints all issues. Optionally filters by milestone name.";
availableCommands.listMilestones.help   = "listMilestones\n\t".cyan
    + "Prints all milestones.";
availableCommands.createMilestones.help = "createMilestones <title> <due_on>\n\t".cyan
    + "Creates new milestone in each repo with given title and due date.\n"
    + "\t`due_on` should be a JS-formattable date string like 'Apr 16, 2014'.";
availableCommands.closeMilestones.help  = "closeMilestones <title>\n\t".cyan
    + "Closes all milestones matching title across all repos.";
availableCommands.updateMilestones.help  = "updateMilestones <title> <new-title> [due_on]\n\t".cyan
    + "Updates all milestones matching title across all repos.";
availableCommands.printRepos.help  = "printRepos\n\t".cyan
    + "Prints the repositories Sprinter is configured to run against.";

function printHelp() {
    var help = "\nSprinter CLI Tool".bold.magenta + ": Utilities for operating on issue trackers "
        + "of several repositories at once.\n\n"
        + "REQUIREMENTS\n".underline
        + "Environment variables with the GitHub username and personal access token (NOT your master password) for API calls:\n"
        + "\tGH_USERNAME=<username>\n".grey
        + "\tGH_PASSWORD=<personal access token>\n".grey
        + "Create a personal access token for sprinter.js at https://github.com/settings/applications -> 'Generate token' with 'repo', 'public_repo', and 'repo:status' checked.\n"
        + "\nUSAGE\n".underline
        + "    sprinter <command> <cmd-options> --repos=org/repo,org2/repo2\n".yellow
        + " or\n"
        + "    sprinter <command> <cmd-options> --repos=./path/to/repo/file\n\n".yellow
        + "The repo file should have one repo slug on each line. Instead of providing a --repos option, you could \n"
        + "set the $SPRINTER_REPOS environment variable instead.\n"
    console.log(help);
    console.log('COMMANDS'.underline);
    _.each(availableCommands, function(fn, command) {
        console.log(fn.help);
    });
    console.log('\nEXAMPLE'.underline);
    console.log('sprinter createMilestones "Sprint 43" "April 16, 2014" --repos=rhyolight/highlinker,rhyolight/chesster'.yellow);
}

function handleError(message, exitCode) {
    console.error(message.red);
    printHelp();
    if (exitCode == undefined) {
        exitCode = -1;
    }
    process.exit(exitCode);
}

function readRepoFile(path) {
    var lines = undefined;
    if (fs.existsSync(path)) {
        lines = fs.readFileSync(path, 'utf8').trim().split('\n');
        lines = _.filter(lines, function(line) {
            var trimmed = line.trim();
            return trimmed.length && trimmed.indexOf('#') != 0;
        });
    } else {
        throw new Error('"' + path + '" is not a path to a file.');
    }
    return lines;
}

function processArgs(args) {
    var repoValue = undefined;
    command = args._[0];
    commandArgs = args._.slice(1);
    kwargs = args;
    if (args.help) {
        printHelp();
        process.exit();
    }
    if (args.repos) {
        repoValue = args.repos;
    } else {
        repoValue = process.env['SPRINTER_REPOS'];
    }
    if (! repoValue) {
        console.error('Cannot identify target repositories! Provide either a --repos option or set the ' +
            '$SPRINTER_REPOS environment variable.'.red);
        printHelp();
        process.exit(-1);
    }
    try {
        monitoredRepos = readRepoFile(repoValue);
    } catch (error) {
        monitoredRepos = repoValue.split(',');
    }
}

function exitIfMissingGitHubCreds() {
    githubUsername = process.env['GH_USERNAME'];
    githubPassword = process.env['GH_PASSWORD'];
    if (! githubUsername || ! githubPassword) {
        console.error(('You must set your GitHub credentials into the '
                    + 'environment for this script to run.\n'
                    + '    export GH_USERNAME=<username>\n'
                    + '    export GH_USERNAME=<username>').red);
        process.exit(-1);
    }
}

function printReposCli(sprinter, command, commandArgs, kwargs) {
    console.log("Sprinter is executing commands across the following repositories:");
    console.log("=================================================================");
    monitoredRepos.forEach(function(repo) {
        console.log(repo);
    });
}

function getIssuesCli(sprinter, command, commandArgs, kwargs) {
    // We're selective about what command line keyword options are passed along.
    var filters = {};
    if (kwargs.milestone) {
        filters.milestone = kwargs.milestone;
    }
    if (kwargs.assignee) {
        filters.assignee = kwargs.assignee;
    }
    commandArgs.push(filters);
    commandArgs.push(function(err, issues) {
        if (err) {
            handleError(err.message);
        }
        formatter.formatIssues(issues);
    });
    sprinter.getIssues.apply(sprinter, commandArgs)
}

function getMilestonesCli(sprinter, command, commandArgs, kwargs) {
    commandArgs.push(function(err, milestones) {
        if (err) {
            handleError(err.message);
        }
        formatter.formatMilestones(milestones);
    });
    sprinter.getMilestones.apply(sprinter, commandArgs)
}

function createMilestonesCli(sprinter, command, commandArgs, kwargs) {
    var milestone = {
        title: commandArgs[0],
        due_on: commandArgs[1]
    };
    sprinter.createMilestones(milestone, function(err, milestones) {
        if (err) {
            return console.error(err);
        }
        console.log(milestones);
    });
}

function updateMilestonesCli(sprinter, command, commandArgs, kwargs) {
    var oldTitle = commandArgs[0],
        milestone = {
            title: commandArgs[1]
        };
    if (commandArgs.length > 2) {
        milestone.due_on = commandArgs[2];
    }
    sprinter.updateMilestones(oldTitle, milestone, function(err, milestones) {
        if (err) {
            return console.error(err);
        }
        console.log(milestones);
    });
}

function closeMilestonesCli(sprinter, command, commandArgs, kwargs) {
    // TODO: error check title
    var title = commandArgs[0];
    sprinter.closeMilestones(title, function(err, milestones) {
        // TOOD: handle errors;
        console.log(milestones);
    });
}

processArgs(argv);
exitIfMissingGitHubCreds();

sprinter = new Sprinter(
    githubUsername,
    githubPassword,
    monitoredRepos
);

if (! command) {
    handleError('Missing command!');
}

if (! availableCommands[command]) {
    handleError('Unknown command "' + command + '"!', -1);
}

availableCommands[command](sprinter, command, commandArgs, kwargs);
