const {App, LogLevel} = require("@slack/bolt");
const fetchPromise = import("node-fetch");
function fetch() {
  return fetchPromise.then((module) => module.default.apply(this, arguments));
}

function updateBlock(block) {
  switch (block.type) {
    case "rich_text": {
      delete block.block_id;
      block.elements = block.elements
        .map(updateBlock)
        .reduce((a, b) => a.concat(b), []);
      return [block];
    }
    case "section": {
      const fields = Array.from(block.fields);
      if (block.text) {
        fields.push(block.text);
      }
      block.fields = block.fields
        .map(updateBlock)
        .reduce((a, b) => a.concat(b), []);
      return [block];
    }
    case "rich_text_section": {
      block.elements = block.elements
        .map(updateBlock)
        .reduce((a, b) => a.concat(b), []);
      return [block];
    }
    case "text": {
      let text = block.text;
      const blocks = [];
      let lastKnown = 0;
      let i;
      for (i = 0; i < text.length; ++i) {
        const match = text.substring(i).match(/^(@|chom)(channel|here)/);
        if (match) {
          if (lastKnown != i) {
            blocks.push({
              type: "text",
              text: text.substring(lastKnown, i),
              style: block.style,
            });
          }

          blocks.push({
            type: "broadcast",
            range: match[2],
            style: block.style,
          });

          lastKnown = i + match[0].length;
          i = lastKnown - 1;
        }
      }
      console.log(
        "Finished cycling.. Do we have anything left?",
        lastKnown,
        i,
        text,
        blocks
      );
      if (lastKnown != i) {
        blocks.push({
          type: "text",
          text: text.substring(lastKnown, i),
          style: block.style,
        });
      }

      return blocks;
    }
    case "link":
    case "broadcast":
    case "emoji": {
      return [block];
    }
    default: {
      console.warn("WARNING! Unknown block type!", block.type, block);
      return [block];
    }
  }
}

const app = new App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  appToken: process.env.SLACK_APP_TOKEN,
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  // logLevel: LogLevel.DEBUG,
});

const BLOCKED_CHANNELS = process.env.BLOCKED_CHANNELS.split(",");

async function deleteMessage(client, message) {
  const {FormData} = await fetchPromise;
  const formData = new FormData();
  formData.set("token", process.env.SLACK_USER_TOKEN);
  formData.set("channel", message.channel);
  formData.set("ts", message.ts);
  const res = await fetch("https://cshrit.slack.com/api/chat.delete", {
    method: "POST",
    headers: {
      Cookie: `d=${process.env.SLACK_COOKIE}`,
    },
    body: formData,
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to delete: ${JSON.stringify(body)}`);
  }
}

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
  for (const prefix of ["@", "chom"]) {
    console.log(`Registering ${prefix}${ping}`);
    app.message(`${prefix}${ping}`, async ({message, client, ack, say}) => {
      if (
        message.type != "message" ||
        (message.subtype && message.subtype != "file_share")
      ) {
        console.warn("Ignoring message", message.type, message.subtype);
        return;
      }
      console.log(message);
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

      const {user} = await client.users.info({user: message.user});

      try {
        await editPrefs(client, {
          who_can_at_everyone: "admin",
          who_can_at_channel: "ra",
          warn_before_at_channel: "always",
        });
        const textChunks = [];
        if (message.text) {
          textChunks.push(
            message.text.replace(
              /(?:@|chom)(channel|here)/gm,
              (_, range) => `<!${range}>`
            )
          );
        }
        if (message.files) {
          for (const file of message.files) {
            textChunks.push(file.url_private);
          }
        }
        const messageObject = {
          text: textChunks.join("\n"),
          thread_ts: message.thread_ts,
          username: user.profile.real_name,
          icon_url: user.profile.image_192,
          unfurl_links: true,
          unfurl_media: true,
        };
        console.log(JSON.stringify(messageObject, null, 2));
        await say(messageObject);
        // await deleteMessage(client, message);
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
}

(async () => {
  await app.start(process.env.PORT || 3000);
})();
