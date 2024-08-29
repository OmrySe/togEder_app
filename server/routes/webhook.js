import express from 'express';
import crypto from 'crypto';
import { handleError, sanitize } from '../helpers/routing.js';
import { zoomApp } from '../config.js';
import db from '../helpers/database.js';
import { recallFetch } from '../helpers/recall.js';


const router = express.Router();

/*
 * Receives transcription webhooks from the Recall Bot
 * @see https://recallai.readme.io/reference/webhook-reference#real-time-transcription
 */
router.post('/transcription', async (req, res, next) => {
    try {
        sanitize(req);

        if (
            !crypto.timingSafeEqual(
                Buffer.from(req.query.secret, 'utf8'),
                Buffer.from(zoomApp.webhookSecret, 'utf8')
            )
        ) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        console.log('transcription webhook received: ', req.body);

        const { bot_id, transcript } = req.body.data;

        if (!db.transcripts[bot_id]) {
            db.transcripts[bot_id] = [];
        }

        db.transcripts[bot_id].push(transcript);
        res.status(200).json({ success: true });
    } catch (e) {
        next(handleError(e));
    }
});


//private chat message
// pause for 30 seconds if user request in the chat "pause"
//https://docs.recall.ai/docs/sending-chat-messages
//https://docs.recall.ai/docs/receiving-chat-messages


router.post('/chat', async (req, res) => {
    console.log('Received chat webhook');
    try {
        sanitize(req);

        if (
            !crypto.timingSafeEqual(
                Buffer.from(req.query.secret || '', 'utf8'),
                Buffer.from(zoomApp.webhookSecret, 'utf8')
            )
        ) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        console.log('chat webhook received: ', JSON.stringify(req.body, null, 2));

        const { event, data } = req.body;

        if (event !== 'bot.chat_message' || !data) {
            console.log('Ignoring non-chat message event or missing data');
            return res.status(200).json({ success: true, message: 'Ignored non-chat event' });
        }

        const { sender, text, bot_id } = data;

        if (!bot_id) {
            console.error('Missing bot_id in webhook data');
            return res.status(400).json({ error: 'Missing bot_id' });
        }

        if (!db.chat[bot_id]) {
            db.chat[bot_id] = [];
        }

        db.chat[bot_id].push({ sender, text });

        // Check for 'private' command
        if (text && text.toLowerCase() === 'private') {
            console.log(`Private message received from ${sender.name}, attempting to pause recording for bot ${bot_id}`);
            try {
                await pauseAndResumeRecording(bot_id);
                console.log('Pause and resume operation completed successfully');
            } catch (pauseError) {
                console.error('Error in pause/resume operation:', pauseError);
                // We'll still return a 200 status to acknowledge the webhook, but log the error
                console.error('Failed to pause/resume recording, but webhook processed');
            }
        } else {
            console.log(`Received message "${text}" from ${sender.name}, not triggering pause/resume`);
        }

        console.log('Webhook processing completed successfully');
        res.status(200).json({ success: true });
    } catch (e) {
        console.error('Unexpected error in chat webhook handler:', e);
        res.status(500).json({ error: 'Internal server error', message: e.message, stack: e.stack });
    }
});


async function pauseAndResumeRecording(botId) {
    console.log(`Entering pauseAndResumeRecording function for bot ${botId}`);
    try {
       if (typeof recallFetch !== 'function') {
            throw new Error('recallFetch is not properly defined or imported');
        }
//await recallFetch(`/api/v1/bot/${req.session.botId}/leave_call`
        // Pause the recording
        console.log(`Attempting to pause recording for bot ${botId}`);
        const pauseResponse = await recallFetch(`/api/v1/bot/${botId}/pause_recording`, {
            method: 'POST',
        });
        console.log(`Pause response:`, pauseResponse);

        // Send chat message about pausing
        await sendChatMessage(botId, "The recording has been paused for 30 seconds.");

        console.log(`Recording paused for bot ${botId}. Waiting for 30 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Resume the recording
        console.log(`Attempting to resume recording for bot ${botId}`);
        const resumeResponse = await recallFetch(`/api/v1/bot/${botId}/resume_recording`, {
            method: 'POST',
        });
        console.log(`Resume response:`, resumeResponse);

        // Send chat message about resuming
        await sendChatMessage(botId, "The recording has been resumed.");

        console.log(`Recording resumed for bot ${botId}`);
    } catch (error) {
        console.error(`Error in pauseAndResumeRecording for bot ${botId}:`, error);
        throw error;
    }
}

async function sendChatMessage(botId, message) {
    try {
        const response = await recallFetch(`/api/v1/bot/${botId}/send_chat_message/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: "everyone",
                message: message
            }),
        });
        console.log(`Chat message sent: ${message}`);
        return response;
    } catch (error) {
        console.error(`Error sending chat message: ${error.message}`);
        throw error;
    }
}

export default router;
