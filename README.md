# discord-rss-bot
Sends Discord Messages reading a RSS feed

Reads the RSS Fead every minute
checks if the message is of a type it has to send
checks if the message is in the timeframe defined by config.STORETIME
checks if the message is not stored in messagesstore.json
then:
sends a notification to the config.RSSCHANNELID or config.DEBUGCHANNEL
checks if the RSS Notification is an exercise to hand in
sends the notification in config.RSSAUFGABENCHANNELID or config.DEBUGCHANNEL

saves the RSS Message in messagesstorage.json





Every day at 0:00 all RSS Messages older than config.STORETIME will be deleted.


### Commands
for commands see ?help

## Install
npm i

set the values in the config.json

