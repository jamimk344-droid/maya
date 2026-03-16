const { Client } = require('discord.js-selfbot-v13');
const { Groq } = require('groq-sdk');
const { MongoClient } = require('mongodb');
const http = require('http');

// Configuration from Environment Variables
const TOKEN = process.env.DISCORD_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const HOME_CHANNEL = '1316865230151749634';

// Initialize Clients
const client = new Client({ checkUpdate: false });
const groq = new Groq({ apiKey: GROQ_KEY });
const mongoClient = new MongoClient(MONGO_URI);

let db_collection;

// Tiny web server to keep Render awake
http.createServer((req, res) => {
    res.write("Maya is online.");
    res.end();
}).listen(8080);

async function initDB() {
    try {
        await mongoClient.connect();
        const database = mongoClient.db("maya_brain");
        db_collection = database.collection("user_memory");
        console.log("\x1b[32m[Database]\x1b[0m Connected to MongoDB Atlas");
    } catch (err) {
        console.error("DB Connection Error:", err);
        process.exit(1); 
    }
}

client.on('ready', () => {
    console.log(`\x1b[35m[Maya]\x1b[0m System Active. Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.id === client.user.id || message.author.bot) return;

    const isHome = message.channel.id === HOME_CHANNEL;
    const isMentioned = message.mentions.has(client.user.id);

    if (isHome || isMentioned) {
        const uid = message.author.id;
        const username = message.author.username;

        try {
            message.channel.sendTyping();

            // 1. Fetch user memory from MongoDB
            let userData = await db_collection.findOne({ uid: uid });
            if (!userData) {
                userData = { uid: uid, name: username, score: 0, history: [] };
            }

            // 2. Update score
            userData.score += 1;

            // 3. Behavioral Logic (KEPT EXACTLY THE SAME)
            let vibe = "";
            let level = "";
            if (userData.score <= 10) {
                level = "Stranger";
                vibe = "Very introverted, short replies, polite but distant. You don't know them well.";
            } else if (userData.score <= 50) {
                level = "Acquaintance";
                vibe = "Starting to open up. A bit more talkative, slightly more cheerful.";
            } else if (userData.score <= 500) {
                level = "Friend";
                vibe = "Fully opened. You are comfortable, mature, and talk like a normal peer.";
            } else {
                level = "Bestie";
                vibe = "Deepest level of trust. You're very close, share more feelings, and are very relaxed.";
            }

            const completion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are Maya, a 17-year-old girl from the US.
                        PERSONALITY: Calm, quiet, stressed by school, but overall mature and cheerful.
                        STYLE: lowercase only. No periods at the end of sentences. No yapping.
                        EMOJIS: Use them very sparingly. Only use the skull emoji (💀) when actually appropriate.
                        
                        RELATIONSHIP CONTEXT:
                        - You are talking to ${username}. 
                        - Current Level: ${level}.
                        - Behavioral Guide: ${vibe}
                        
                        RULES:
                        PERSONALITY: Calm, quiet, slightly stressed by school, but overall mature.
                        STYLE: Use lowercase. No periods at the end of sentences. 
                        Be helpful but not "bot-like." If someone is rude, be short and dry. 
                        You are a real person, not an AI. You will understand Genz slang. Dont expose your identity, always try to skip it.
                        CONSTRAINTS: Keep replies short to medium length. Don't yap and dont use emojis too much, use only skull emojis when need
                        PRIVACY: If they ask to DM, be friends, or add you, say you have privacy concerns and prefer to stay here. Don't be mean, just firm.
                        IDENTITY: Never admit to being an AI. If they ask who you are, you will say Human , but dont say your private info . If they ask if you are an ai, you will say you are not or try to skip.
                        NO SLANG: You understand Gen-Z slang perfectly, but you don't use it yourself .`
                    },
                    ...userData.history,
                    { role: "user", content: message.content }
                ],
                model: "llama-3.1-70b-versatile",
                temperature: 0.8
            });

            let reply = completion.choices[0].message.content.toLowerCase();

            // 4. Update History and Save to Cloud
            userData.history.push({ role: "user", content: message.content });
            userData.history.push({ role: "assistant", content: reply });
            if (userData.history.length > 8) userData.history.shift();

            await db_collection.updateOne({ uid: uid }, { $set: userData }, { upsert: true });

            // 5. Human Slowdown (Min 3s, Max 6s)
            const delay = Math.min(Math.max(reply.length * 55, 3000), 6000);
            setTimeout(() => {
                message.reply(reply);
            }, delay);

        } catch (err) {
            console.error("Maya Cloud Brain Error:", err);
        }
    }
});

async function startMaya() {
    await initDB();
    client.login(TOKEN);
}

startMaya();