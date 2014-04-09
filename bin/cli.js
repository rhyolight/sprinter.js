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
    listIssues: getIssuesCli,
    listMilestones: getMilestonesCli,
    createMilestones: createMilestonesCli,
    closeMilestones: closeMilestonesCli
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

function printHelp() {
    var help = "\nSprinter CLI Tool".bold.magenta + ": Utilities for operating on issue trackers "
        + "of several repositories at once.\n\n"
        + "REQUIREMENTS\n".underline
        + "Environment variables with the Github username and password for API calls:\n"
        + "\tGH_USERNAME=<username>\n".grey
        + "\tGH_PASSWORD=<password>\n".grey
        + "\nUSAGE\n".underline
        + "    sprinter <command> <cmd-options> --repo=org/repo,org2/repo2\n".yellow
        + " or\n"
        + "    sprinter <command> <cmd-options> --repo=./path/to/repo/file\n\n".yellow
        + "The repo file should have one repo slug on each line.\n"
    console.log(help);
    console.log('COMMANDS'.underline);
    _.each(availableCommands, function(fn, command) {
        console.log(fn.help);
    });
    console.log('\nEXAMPLE'.underline);
    console.log('sprinter createMilestones "Sprint 43" "April 16, 2014" --repo=rhyolight/highlinker,rhyolight/chesster'.yellow);
}

function handleError(message, exitCode) {
    console.error(message.red);
    printHelp();
    process.exit(exitCode);
}

function readRepoFile(path) {
    if (fs.existsSync(path)) {
        return fs.readFileSync(path, 'utf8').trim().split('\n');
    } else {
        throw new Error('"' + path + '" is not a path to a file.');
    }
}

function processArgs(args) {
    command = args._[0];
    commandArgs = args._.slice(1);
    kwargs = args;
    if (args.help) {
        printHelp();
        process.exit();
    }
    if (! args.repos) {
        console.error('Missing --repos option!'.red);
        printHelp();
        process.exit(-1);
    }
    try {
        monitoredRepos = readRepoFile(args.repos);
    } catch (error) {
        monitoredRepos = args.repos.split(',');
    }
}

function exitIfMissingGithubCreds() {
    githubUsername = process.env['GH_USERNAME'];
    githubPassword = process.env['GH_PASSWORD'];
    if (! githubUsername || ! githubPassword) {
        console.error(('You must set your Github credentials into the '
                    + 'environment for this script to run.\n'
                    + '    export GH_USERNAME=<username>\n'
                    + '    export GH_USERNAME=<username>').red);
        process.exit(-1);
    }
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
        // TODO: handle errors.
        if (err) {
            if (err.code == 404 && err.repo) {
                handleError('Unknown repository: "' + err.repo + '"', -1);
            }
        }
        formatter.formatIssues(issues);
    });
    sprinter.getIssues.apply(sprinter, commandArgs)
}

function getMilestonesCli(sprinter, command, commandArgs, kwargs) {
    commandArgs.push(function(err, milestones) {
        // TODO: handle errors.
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
        // TODO: handle errors.
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
exitIfMissingGithubCreds();

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
