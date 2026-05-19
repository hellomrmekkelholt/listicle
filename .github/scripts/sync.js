const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

// Initialize Notion Client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const pageId = process.env.NOTION_PAGE_ID;

async function syncDocs() {
  try {
    // Look for markdown files inside your docs folder
    const docsDir = path.join(__dirname, "../../docs");
    
    if (!fs.existsSync(docsDir)) {
      console.error("The 'docs' directory was not found.");
      return;
    }

    const files = fs.readdirSync(docsDir).filter(file => file.endsWith(".md"));
    let fullMarkdownContent = "";

    // Read all markdown files and combine them
    for (const file of files) {
      const content = fs.readFileSync(path.join(docsDir, file), "utf8");
      fullMarkdownContent += `\n\n### File: ${file}\n${content}`;
    }

    // Standard markdown strings must be broken down for the Notion API.
    // For this native script, we pass it as a clean text block chunk.
    console.log("Clearing existing content and updating Notion page...");
    
    // First, clear the page by fetching blocks and deleting them (optional, but ensures clean updates)
    const existingBlocks = await notion.blocks.children.list({ block_id: pageId });
    for (const block of existingBlocks.results) {
      await notion.blocks.delete({ block_id: block.id });
    }

    // Append the fresh text content to the Notion Page
    await notion.blocks.children.append({
      block_id: pageId,
      children: [
        {
          object: "block",
          type: "heading_1",
          heading_1: { rich_text: [{ type: "text", text: { content: "🚀 Automated Repository Docs Sync" } }] }
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: fullMarkdownContent.substring(0, 2000) } }] // Notion chunk limit safety
          }
        }
      ]
    });

    console.log("✅ Successfully synced docs to Notion!");
  } catch (error) {
    console.error("❌ Error syncing to Notion:", error);
    process.exit(1);
  }
}

syncDocs();