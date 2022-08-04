const fetch = require("./fetch");

if (!process.env.GITHUB_TOKEN) {
  console.error("🔴 no GITHUB_TOKEN found. pass `GITHUB_TOKEN` as env");
  process.exitCode = 1;
  return;
}
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!process.env.INPUT_OWNER) {
  console.error("🔴  no `owner` name given. pass `INPUT_OWNER` as env");
  process.exitCode = 1;
  return;
}
const owner = process.env.INPUT_OWNER;

if (!process.env.INPUT_REPOS) {
  console.error("🔴  no `repos` name given. pass `INPUT_REPOS` as env");
  process.exitCode = 1;
  return;
}
const repos = (process.env.INPUT_REPOS).split(",");

if (!process.env.INPUT_KEEP_LATEST) {
  console.error("✋🏼  no `keep_latest` given. exiting...");
  process.exitCode = 1;
  return;
}
const keepLatest = Number(process.env.INPUT_KEEP_LATEST);

if (Number.isNaN(keepLatest) || keepLatest < 0) {
  console.error("🤮  invalid `keep_latest` given. exiting...");
  process.exitCode = 1;
  return;
}

if (keepLatest === 0) {
  console.error("🌶  given `keep_latest` is 0, this will wipe out all releases");
}

const shouldDeleteTags = process.env.INPUT_DELETE_TAGS === "true";

if (shouldDeleteTags) {
  console.log("🔖  corresponding tags also will be deleted");
}

let deletePattern = process.env.INPUT_DELETE_TAG_PATTERN || "";
if (deletePattern) {
  console.log(`releases containing ${deletePattern} will be targeted`);
}
const commonOpts = {
  host: "api.github.com",
  port: 443,
  protocol: "https:",
  auth: `user:${GITHUB_TOKEN}`,
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "node.js",
  },
};

async function deleteOlderReleases(keepLatest) {
  let releaseIdsAndTags = [];
  for(repo of repos) {
    try {
      let data = await fetch({
        ...commonOpts,
        path: `/repos/${owner}/${repo}/releases?per_page=100`,
        method: "GET",
      });
      data = data || [];
      // filter for delete_pattern
      const activeMatchedReleases = data.filter(
        ({ draft, tag_name }) => !draft && tag_name.indexOf(deletePattern) !== -1
      );

      if (activeMatchedReleases.length === 0) {
        console.log(`😕  no active releases found. exiting...`);
        return;
      }

      const matchingLoggingAddition = deletePattern.length > 0 ? " matching" : "";

      console.log(
        `💬  found total of ${activeMatchedReleases.length}${matchingLoggingAddition} active release(s)`
      );

      releaseIdsAndTags = activeMatchedReleases
        .sort((a,b)=> Date.parse(b.published_at) - Date.parse(a.published_at))
        .map(({ id, tag_name: tagName }) => ({ id, tagName }))
        .slice(keepLatest);

    } catch (error) {
      console.error(`🌶  failed to get list of releases <- ${error.message}`);
    }

    if (releaseIdsAndTags.length === 0) {
      console.error(`😕  no older releases found for ${repo}. exiting...`);
    }
    console.log(`🍻  found ${releaseIdsAndTags.length} older release(s) for ${repo}`);

    for (let i = 0; i < releaseIdsAndTags.length; i++) {
      const { id: releaseId, tagName } = releaseIdsAndTags[i];

      try {
        console.log(`${repo}: starting to delete ${tagName} with id ${releaseId}`);

        const _ = await fetch({
          ...commonOpts,
          path: `/repos/${owner}/${repo}/releases/${releaseId}`,
          method: "DELETE",
        });

        if (shouldDeleteTags) {
          try {
            const _ = await fetch({
              ...commonOpts,
              path: `/repos/${owner}/${repo}/git/refs/tags/${tagName}`,
              method: "DELETE",
            });
          } catch (error) {
            console.error(
              `🌶  failed to delete tag "${tagName}" for ${repo} <- ${error.message}`
            );
          }
        }
      } catch (error) {
        console.error(
          `🌶  failed to delete release with id "${releaseId}" for ${repo} <- ${error.message}`
        );
      }
    }

    console.log(
      `👍🏼  ${releaseIdsAndTags.length} older release(s) for ${repo} deleted successfully!`
    );
  }
}

async function run() {
  await deleteOlderReleases(keepLatest);
}

run();
