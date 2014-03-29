var fs = require('fs'),
    Sprinter = require('../sprinter'),
    argv = require('minimist')(process.argv.slice(2)),
    sprinter,
    command, commandArgs,
    githubUsername, githubPassword,
    monitoredRepos;

function readRepoFile(path) {
    if (fs.existsSync(path)) {
        return fs.readFileSync(path, 'utf8').trim().split('\n');
    } else {
        throw new Error('"' + path + '" is not a path to a file.');
    }
}

function processArgs(args) {
    console.info(args);
    command = args._[0];
    commandArgs = args._.slice(1);
    try {
        monitoredRepos = readRepoFile(args.repos);
    } catch (error) {
        monitoredRepos = args.repos.split(',');
    }
    console.info(command + ': ' + commandArgs)
    console.info(monitoredRepos);
}

function exitIfMissingGithubCreds() {
    githubUsername = process.env['GH_USERNAME'];
    githubPassword = process.env['GH_PASSWORD'];
    if (! githubUsername || ! githubPassword) {
        console.error('You must set your Github credentials into the '
            + 'environment for this script to run.\n'
            + '    export GH_USERNAME=<username>\n'
            + '    export GH_USERNAME=<username>');
        process.exit(-1);
    }
}

function getIssuesCli(sprinter, command, commandArgs) {
    commandArgs.push(function(err, issues) {
        // TODO: handle errors.
        console.log(issues);
    });
    sprinter.getIssues.apply(sprinter, commandArgs)
}

function getMilestonesCli(sprinter, command, commandArgs) {
    commandArgs.push(function(err, milestones) {
        // TODO: handle errors.
        console.log(milestones);
    });
    sprinter.getMilestones.apply(sprinter, commandArgs)
}

function createMilestonesCli(sprinter, command, commandArgs) {
    var milestone = {
        title: commandArgs[0],
        due_on: commandArgs[1]
    };
    sprinter.createMilestones(milestone, function(err, milestones) {
        // TODO: handle errors.
        console.log(milestones);
    });
}

function closeMilestonesCli(sprinter, command, commandArgs) {
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

switch (command) {
    case 'listMilestones':
        getMilestonesCli(sprinter, command, commandArgs);
        break;
    case 'createMilestones':
        createMilestonesCli(sprinter, command, commandArgs);
        break;
    case 'closeMilestones':
        closeMilestonesCli(sprinter, command, commandArgs);
        break;
    case 'listIssues':
        getIssuesCli(sprinter, command, commandArgs);
        break;
    default:
        console.log('Unknown command "' + command + '".');
}
