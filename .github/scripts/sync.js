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
      throw new Error(`The 'docs' directory was not found at expected path: ${docsDir}`);
    }

    const files = fs.readdirSync(docsDir).filter(file => file.endsWith(".md"));
    if (files.length === 0) {
      throw new Error("No .md files found inside your 'docs' folder.");
    }

    let finalBlocks = [];

    for (const file of files) {
      console.log(`Processing file: ${file}...`);
      const content = fs.readFileSync(path.join(docsDir, file), "utf8");
      
      finalBlocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { 
          rich_text: [{ type: "text", text: { content: `📄 File: ${file}` } }],
          color: "blue_background"
        }
      });

      // Convert MD text to structured Notion blocks
      const fileBlocks = markdownToBlocks(content);
      finalBlocks = finalBlocks.concat(fileBlocks);
    }

    console.log("Fetching existing blocks to clear the target page...");
    const existingBlocks = await notion.blocks.children.list({ block_id: pageId });
    
    for (const block of existingBlocks.results) {
      await notion.blocks.delete({ block_id: block.id });
    }

    console.log(`Pushing ${finalBlocks.length} structured blocks to Notion...`);
    
    // Process blocks in chunks of 100 to abide by API constraints
    while (finalBlocks.length > 0) {
      const chunk = finalBlocks.splice(0, 100);
      await notion.blocks.children.append({
        block_id: pageId,
        children: chunk
      });
    }

    console.log("✅ Successfully synced docs to Notion!");
  } catch (error) {
    console.error("❌ CRITICAL ERROR DURING SYNC:");
    // This will print the raw, detailed error to your GitHub logs
    console.error(error); 
    process.exit(1);
  }
}

syncDocs();