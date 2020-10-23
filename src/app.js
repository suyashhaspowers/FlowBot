import { RTMClient } from '@slack/rtm-api'
import { WebClient } from '@slack/web-api'


require('dotenv').config();

const rtm = new RTMClient(process.env.TOKEN);
const web = new WebClient(process.env.TOKEN)
const moment = require('moment');
const chrono = require('chrono-node');
const dedent = require('dedent-js');


rtm.start()
    .catch(console.error);

rtm.on("ready", async() => {
    console.log("bot started");
});

rtm.on('slack_event', async (eventType, event) => {
    if (event && event.type === 'message' && 'bot_id' in event === false) {
        handleMessage(event);
    }
})

// Function that sends message right now
async function sendMessageNow(channel, message) {
    try {
        await web.chat.postMessage({
            channel: channel,
            text: message,
            as_user: true,
            username: "FlowBot"
        })
    }
    catch(e) {
        console.error(e);
    }
}

// Function that sends message at posted time
async function sendMessageLater(channel, message, time) {
    try {
        await web.chat.scheduleMessage({
            channel: channel,
            text: message,
            post_at: time,
            as_user: true,
            username: "FlowBot"
        })
    }
    catch(e) {
        console.error(e);
    }
}

// Function that obtains the chat history of a channel to a certain limit
async function getChatHistory(channel, limit) {
    try {
        const history = await web.conversations.history({
            channel: channel,
            limit: limit,
        });
        return history;
    }
    catch(e) {
        console.error(e);
    }
}

async function checkUserExists(user) {
    var exists = true;
    try {
        await web.users.info({
            user: user,
        });
    }
    catch {
        exists = false;
    }
    return exists;
} 

async function handleMessage(event) {
    var message;
    var send_date;
    var reciever;
    var incorrect_time = false;
    var non_existent_user = false;
    if (event.text == '!start' || event.text == '!restart') {
        // Start Command
        message = 'Hey! Who would you like to message?';
    }
    else if (event.text == '!help') {
        // Help Command
        message = `Welcome to FlowBot! FlowBot allows you to schedule your messages such that you don't interrupt and break your co-worker's state of flow. To get started, type *!start* . If you want to restart, simply input *!restart* .`;
    }
    else if (event.text.includes("<@") && event.text.includes(">")) {
        // Process the reciepient and see if they exist in the workspace
        const user_id = event.text.substr(2, event.text.length - 3);
        const exists = checkUserExists(user_id);

        if (exists) {
            message = dedent`Enter the message you wanted to send them. Include the message within triple quotations (""") to help me better read it.
        
            ex. 
            """ Sample message """`;
        }
        else {
            message = "Unknown user. Please re-enter a valid user or type *!help* to get help.";
        }
    }
    else if (event.text.includes('"""')) {
        // Get message body command
        message = dedent`How long from now would you like me to send this message?
        
        ex. 
        25 minutes from now`;
    }
    else {
        try {
            // Try to send scheduled message
            send_date = get_datetime_object(event.text);
            const message_details = await find_message_and_reciever(event.channel);
            var ts = Math.round(send_date.getTime() / 1000);

            var formatted_message = dedent(`
            Hey! This is a scheduled FlowBot Message sent by: <@${event.user}>
                
            *Message:*
            ${message_details['message']}
            `);

            sendMessageLater(message_details['reciever'], formatted_message, ts);
            message = 'Your message will be sent!';
            console.log({
                message: formatted_message,
                timestamp: ts
            });
            
        } catch(e) {
            // There is no scheduled message and instead, this is an unknown command
            console.log(e);
            message = "Unknown command! To get help, simply input *!help* or to start, input *!start* .'";
        }
    }
    sendMessageNow(event.channel, message);
}

// NLP Library that parses date from string
function get_datetime_object(message) {
    var get_date;
    get_date = chrono.casual.parseDate(message);
    return get_date;
}

// Function to find send_message and reciever
async function find_message_and_reciever(channel) {
    const history = (await getChatHistory(channel, 5))['messages'];
    var reciever_raw = history[4].text
    var reciever_clean = reciever_raw.substr(2, reciever_raw.length - 3)
    const message_details = {
        message: history[2].text,
        reciever: reciever_clean
    };
    return message_details;
}