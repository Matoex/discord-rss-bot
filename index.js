const Discord = require("discord.js");
const fs = require('fs');
const schedule = require('node-schedule');
const Parser = require('rss-parser');
var dateFormat = require("dateformat");

const config = require(__dirname + "/config.json");
const subjects = require(__dirname + "/subjects.json");
const objects = require(__dirname + "/objects.json");
const messagesStore = require(__dirname + "/messagesstore.json");

const parser = new Parser();
const client = new Discord.Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] })

client.login(config.BOT_TOKEN);


// Reread RSS every Minute
schedule.scheduleJob('* * * * *', () => {
    reloadRSS()
});


// cleanup Messages Store every Day
schedule.scheduleJob('0 0 * * *', () => {
    cleanupMessagesStore()
});

client.on("ready", () => {
    console.log(client.user.username + " started");
    test();
    reloadRSS();
    cleanupMessagesStore()
})

client.on('message', (msg) => {
    // If it's a message from the but, dont do anything
    if (msg.author.bot) return;

    // Args is an array with the words of the message, seperated by whitespaces
    const args = msg.content.replace("\n", " ").split(' ');

    // If the array length is 0 return
    if (args.length == 0) return;

    switch (args[0]) {
        // To bulk delete messages
        case "?purge":
            // Don't do anything if its not a server-textchannel
            if (msg.channel.type != "text") return msg.reply('Das hier ist kein Textchannel auf einem Server!');
            // Only purge if person giving command is authorized to delete messages
            if (!msg.member.hasPermission('MANAGE_MESSAGES')) return msg.reply('Keine Berechtigung!');

            // Amount of messages to be deleted
            // "?purge 6 9" deletes 69 messages
            const amount = args.slice(1).join('');

            if (!amount) return msg.reply('Keine Anzahl angegeben!');
            if (isNaN(amount)) return msg.reply('Keine Zahl angegeben!');

            if (amount > 99) return msg.reply('Du kannst nicht mehr als 99 Nachrichten auf ein mal löschen!');
            if (amount < 1) return msg.reply('Du musst mindestens eine Nachricht löschen!');

            // Delete amount amount of messages
            msg.channel.bulkDelete(parseInt(amount) + 1);
            break;


        // To manually reload the rssFeed
        case "?reloadrss":
            // TODO: Check permission of command issuer
            reloadRSS();
            break;


        // To list all availabe commands
        case "?help":
            const e1 = new Discord.MessageEmbed()
                .setColor("#037a90")
                .addField("?purge <1-99>", "Löscht 1-99 Nachrichten")
                .addField("?reloadrss", "Läd den RSS Feed manuell neu")
                .addField("?debugmodetoggle", "Schaltet den Debug Modus ein/aus")
                .addField("?getdebugmode", "Zeigt an, ob der Debugmodus gerade aktiviert/deaktiviert ist")
            return msg.channel.send(e1);


        case "?debugmodetoggle":
            if (!msg.member.hasPermission('MANAGE_MESSAGES')) return msg.reply('Keine Berechtigung!');
            config.DEBUGMODE = !config.DEBUGMODE;
            saveJSON("config.json", config)
            return msg.reply('DEBUGMODE is now ' + config.DEBUGMODE);


        case "?getdebugmode":
            if (!msg.member.hasPermission('MANAGE_MESSAGES')) return msg.reply('Keine Berechtigung!');
            return msg.reply('DEBUGMODE is ' + config.DEBUGMODE);
    }
});

function test() {

}

async function reloadRSS() {
    const feed = await parser.parseURL(config.RSSURL);
    const datemax = new Date();
    datemax.setDate(datemax.getDate() - config.STORETIME);

    for (const item of feed.items) {
        // Check filetype
        const fileType = checkFileType(item);
        if (fileType) {
            const dateorigin = new Date(item.isoDate);
            if (dateorigin < datemax) break;


            // Check if item is in messagesStore
            if (checkMessageStore(item)) continue;
            messagesStore[item.link] = { isoDate: item.isoDate }

            // Item is not in messagesStore => Send message
            const parsedItem = parseItem(item);

            const message = new Discord.MessageEmbed()
                .setTitle((parsedItem[2].icon || '') + " " + fileType.icon + " " + parsedItem[0].icon + " " + parsedItem[1])
                .setColor(parsedItem[0].color)
                .setURL(item.link)
                .setAuthor(parsedItem[0].name)
                .setDescription("```" + parsedItem[3] + "```");

            const channel = await client.channels.fetch(config.DEBUGMODE ? config.BOTTESTCHANNELID : config.RSSCHANNELID);
            channel.send(message)

            checkUebung(parsedItem, item.link, item.isoDate)
        }
    }
    saveJSON('messagesstore.json', messagesStore);
}

async function checkUebung(parsedItem, link, time) {
    const subject = parsedItem[0];
    const filename = parsedItem[1];
    const path = parsedItem[3];

    //Check if subject has exercises to hand in
    if (subject.exerciseDeadline) {
        //Check File Path
        if (!path.startsWith(subject.exercisePath)) return;

        //Check File Name
        if (!filename.match(subject.exerciseDocumentName)) return;

        const nowdate = new Date(time)

        let expiredate = new Date(time);
        expiredate.setDate(expiredate.getDate() + subject.exerciseDeadline);

        const message = [
            subject.icon + " " + subject.name + " - " + filename,
            "Verfügbar seit: " + dateFormat(nowdate, "dd.mm.yyyy"),
            "Fällig am: " + dateFormat(expiredate, "dd.mm.yyyy") + " " + subject.exerciseTime,
            "Angabe: " + link,
        ].join('\n');
        const channel = await client.channels.fetch(config.DEBUGMODE ? config.BOTTESTCHANNELID : config.RSSAUFGABENCHANNELID);
        channel.send(message)
    }

}

function checkFileType(rssItem) {
    const current_url = new URL(rssItem.link);
    const search_params = current_url.searchParams;
    const target = search_params.get('target');
    const targetSplit = target.split('_')[0];
    if (!objects.filetype[targetSplit]) return undefined;
    return objects.filetype[targetSplit];
}

/**
 * returns a tupel with 4 entries
 * 0: subject name -> subjects
 * 1: file name 
 * 2: file status -> objects.status
 * 3: file path
 */
function parseItem(rssItem) {
    const rssTitle = rssItem.title;
    const split = rssTitle.split('] ');

    const nameAndStatus = split[split.length - 1].split(': ');
    const fileName = nameAndStatus[0];
    const fileStatus = nameAndStatus[1];

    split.splice(split.length - 1);
    const filePath = split.join('] ').substring(1);
    const subject = filePath.split(' > ')[0];
    const subjectObject = subjects[subject];

    const fileStatusObject = objects.status[fileStatus];

    return [subjectObject, fileName, fileStatusObject || {}, filePath];
}

// Only returns true if rssItem exists in messageStore
function checkMessageStore(rssItem) {
    return !!messagesStore[rssItem.link];
}

function saveJSON(name, object) {
    fs.writeFile(`${__dirname}/${name}`, JSON.stringify(object, null, 4), err => {
        if (err) throw err;
    });
}

function cleanupMessagesStore() {
    const datemax = new Date();
    datemax.setDate(datemax.getDate() - config.STORETIME);
    for (const key in messagesStore) {
        const dateraw = messagesStore[key].isoDate;
        const dateorigin = new Date(dateraw);

        if (dateorigin < datemax)
            delete messagesStore[key];
    }
    saveJSON("messagesstore.json", messagesStore)
}
