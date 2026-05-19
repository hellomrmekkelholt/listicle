const { Client } = require("@notionhq/client");
const { markdownToBlocks } = require("@tryfabric/martian");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const pageId = process.env.NOTION_PAGE_ID;

async function syncDocs() {
  try {
    const docsDir = path.join(__dirname, "../../docs");
    
    if (!fs.existsSync(docsDir)) {
      console.error("The 'docs' directory was not found.");
      return;
    }

    const files = fs.readdirSync(docsDir).filter(file => file.endsWith(".md"));
    let finalBlocks = [];

    // Loop through each markdown file
    for (const file of files) {
      const content = fs.readFileSync(path.join(docsDir, file), "utf8");
      
      // 1. Add a visual separator header for each file
      finalBlocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { 
          rich_text: [{ type: "text", text: { content: `📄 File: ${file}` } }],
          color: "blue_background"
        }
      });

      // 2. Translate raw markdown string into Notion API-compliant JSON blocks
      const fileBlocks = markdownToBlocks(content);
      finalBlocks = finalBlocks.concat(fileBlocks);
    }

    console.log("Clearing existing content from Notion page...");
    const existingBlocks = await notion.blocks.children.list({ block_id: pageId });
    for (const block of existingBlocks.results) {
      await notion.blocks.delete({ block_id: block.id });
    }

    console.log(`Pushing ${finalBlocks.length} structured blocks to Notion...`);
    
    // Notion API limits block updates to batches of 100 at a time
    while (finalBlocks.length > 0) {
      const chunk = finalBlocks.splice(0, 100);
      await notion.blocks.children.append({
        block_id: pageId,
        children: chunk
      });
    }

    console.log("✅ Successfully synced beautifully styled markdown to Notion!");
  } catch (error) {
    console.error("❌ Error syncing to Notion:", error);
    process.exit(1);
  }
}

syncDocs();