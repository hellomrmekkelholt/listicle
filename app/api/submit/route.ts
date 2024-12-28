import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: process.env.OPENAI_API_URL, // Use the environment variable
  apiKey: process.env.OPENAI_API_KEY // Use the environment variable
});

export async function POST(req: NextRequest) {
  const { subject, object } = await req.json();
  console.log("Prompt:"+subject+" "+object);

  var content = `
Generate a list of 3 to 5 things based on this format: 3 (or 4 or 5) things "subject" has taught me about "object" where
subject is: ${subject}
object is: ${object} 
Use puns, sarcasm and language that is more irreverent and playful to make the items in the list humorous
Each item should be around 10 to 20 words  
Return only the list in markdown format 
`;
console.log("Prompt:"+content);
  try {
    const response = await openai.chat.completions.create({
      model: "YOUR_LOCAL_MODEL",
      messages: [{ role: "user", content: content }]
    });
    console.log("API:" + response.choices[0].message.content);
    return NextResponse.json({ paragraph: response.choices[0].message.content });
  } catch (error) {
    return NextResponse.json({ error: 'Error generating response from OpenAI' }, { status: 500 });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};