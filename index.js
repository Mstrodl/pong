const {App, LogLevel} = require("@slack/bolt");
const fetchPromise = import("node-fetch");
function fetch() {
  return fetchPromise.then((module) => module.default.apply(this, arguments));
}

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // appToken: process.env.SLACK_APP_TOKEN,
  token: process.env.SLACK_BOT_TOKEN,
  // socketMode: true,
  // logLevel: LogLevel.DEBUG,
});

const BLOCKED_CHANNELS = process.env.BLOCKED_CHANNELS.split(",");

async function editPrefs(client, prefs) {
  const {FormData} = await fetchPromise;
  const formData = new FormData();
  formData.set("token", process.env.SLACK_USER_TOKEN);
  formData.set("prefs", JSON.stringify(prefs));
  const res = await fetch("https://cshrit.slack.com/api/team.prefs.set", {
    method: "POST",
    headers: {
      Cookie: `d=${process.env.SLACK_COOKIE}`,
    },
    body: formData,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to change: ${JSON.stringify(body)}`);
  }
}

const PINGS = ["channel", "here"];
for (const ping of PINGS) {
  app.message(`@${ping}`, async ({message, client, ack, say}) => {
    if (!message.channel) {
      console.error("No channel id??", message.channel, message.channel_id);
      return;
    }
    if (BLOCKED_CHANNELS.includes(message.channel)) {
      await client.reactions.add({
        name: "no_entry",
        channel: message.channel,
        timestamp: message.ts,
      });
      return;
    }

    try {
      await editPrefs(client, {
        who_can_at_everyone: "admin",
        who_can_at_channel: "ra",
        warn_before_at_channel: "always",
      });
      await say({
        text: `<!${ping}>`,
        thread_ts: message.thread_ts || message.ts,
      });
      await editPrefs(client, {
        who_can_at_everyone: "admin",
        who_can_at_channel: "admin",
        warn_before_at_channel: "always",
      });
    } catch (err) {
      console.error("Error sending message", err);
      throw err;
    }
  });
}

(async () => {
  await app.start(process.env.PORT || 3000);
})();
