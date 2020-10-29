import { RTMClient } from '@slack/rtm-api'
import { WebClient } from '@slack/web-api'


require('dotenv').config();

const rtm = new RTMClient(process.env.TOKEN);
const web = new WebClient(process.env.TOKEN)
const moment = require('moment');
const chrono = require('chrono-node');
const dedent = require('dedent-js');

var message_sessions = {};


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
    try{
        await web.chat.scheduleMessage({
            channel: channel,
            text: message,
            post_at: time,
            as_user: true,
            username: "FlowBot"
        })
    }
    catch(e) {
        throw e;
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
    var session_existence = get_existence(event.user);
    var session;
    var user_id = event.user;
    var message = "";
    var message_needed = false;

    if (session_existence) {
        session = get_session(user_id);
    }

    if (!session_existence && event.text == '!start') {
        create_session(user_id, event);
    }
    else if (event.text == '!help') {
        message = `Welcome to FlowBot! FlowBot allows you to schedule your messages such that you don't interrupt and break your co-worker's state of flow. To get started, type *!start* . If you want to restart, simply input *!restart* . If you decide that you want to end your flowbot session early, enter *!end*.`;
        message_needed = true;
    }
    else if (session_existence) {
        handle_session(session, event);
    }
    else {
        message = "Unknown command! To get help, simply input *!help* or to start, input *!start* .";
        message_needed = true;
    }

    if (message_needed) {
        sendMessageNow(event.channel, message);
    }
}

// NLP Library that parses date from string
function get_datetime_object(message) {
    var get_date;
    get_date = chrono.casual.parseDate(message);
    return get_date;
}

function get_existence(user_id) {
    if (message_sessions.hasOwnProperty(user_id)){
        return true;
    }
    return false;
}

function get_session(user_id) {
    return message_sessions[user_id];
}

function create_session(user_id, event) {
    var session = {
        step: 0,
        message: "",
        reciever: "",
        send_time: 0,
    }

    message_sessions[user_id] = session;
    handle_session(message_sessions[user_id], event);
}

async function delete_session(user_id) {
    delete message_sessions[user_id];
}

async function handle_session(session, event) {
    // Session Guidelines:
    // step == 0 - user has just entered !start
    // step == 1 - user must now enter who they would like to message
    // step == 2 - user must enter the message they would like to send
    // step == 3 - user must enter the time they want to send the message
    // step == 4 - user has supplied all information, message will be scheduled, session object will be removed, session destroyed
    // event.text == "!restart" - step goes back to 0 and all other values are reset
    // event.text == "!end" - ends session

    var message;

    if (event.text == "!end") {
        await delete_session(user_id);
        message = "I just ended your FlowBot session! To get started again, please enter *!start* or type in *!help* to learn how to use me!" ;
    }

    if (event.text == "!restart") {
        session.step = 0;
        session.message = "";
        session.reciever = "";
        session.send_time = 0;
    }
    
    if (session.step == 0) {
        message = 'Hey! Who would you like to message?';
        session.step = 1;
    }
    else if (session.step == 1) {
        //Process the reciepient and see if they exist in the workspace
        const user_id = event.text.substr(2, event.text.length - 3);
        const exists = await checkUserExists(user_id);

        if (exists) {
            message = dedent`What did you want to say to them?
        
            ex. 
            Hey, I was just wondering if you were available for a quick call on Friday?`;
            session.reciever = user_id;
            session.step = 2;
        }
        else {
            message = "I'm not sure I understand. You can start by typing *@* to see a list of users to message. For more information use the *!help* command.";
        }
    }
    else if (session.step == 2) {
        message = dedent`How long from now would you like me to send this message?
            ex. 
            25 minutes from now`;
        session.message = event.text;
        session.step = 3;
    }
    else if (session.step == 3) {
        try {
            session.send_time = get_datetime_object(event.text);
            session.send_time = Math.round(session.send_time.getTime() / 1000);
            session.step = 4;
        }
        catch(e) {
            message = dedent`I am having trouble undertsanding the time that you provided. Could you try again?
            ex.
            1 minute from now`
        }
    }

    if (session.step == 4) {
        try {
            var formatted_message = dedent(`
                Hey! This is a scheduled FlowBot Message sent by: <@${event.user}>
                    
                *Message:*
                ${session.message}`
            );

            await sendMessageLater(session.reciever, formatted_message, session.send_time);
            message = 'Your message will be sent!';
            console.log(session);

            await delete_session(event.user);
        }
        catch(e) {
            console.log(e);
            const error_name = e.data.error;
            if (error_name == 'time_in_past') {
                message = 'The time you entered was either in the past or too close to the current time. Please re-enter a new time.';
                session.step = 3;
            }
        }
    }
    sendMessageNow(event.channel, message);
}