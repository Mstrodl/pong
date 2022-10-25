const {App} = require("@slack/bolt");

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});
const BLOCKED_CHANNELS = process.env.BLOCKED_CHANNELS.split(",");

app.message("@channel", async ({message, client, ack, say}) => {
  if (BLOCKED_CHANNELS.includes(message.channel.id)) {
    await client.reactions.add({
      name: "no_entry",
      channel: command.channel_id,
      timestamp: command.ts,
    });
    return;
  }
  await respond({
    text: "<!channel>",
    thread_ts: message.thread_ts || message.ts,
  });
});

(async () => {
  await app.start(process.env.PORT || 3000);
})();
