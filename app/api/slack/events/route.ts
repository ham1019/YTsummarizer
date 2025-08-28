import { NextRequest, NextResponse } from 'next/server';
import { WebClient } from '@slack/web-api';
import { YoutubeTranscript } from 'youtube-transcript';
import OpenAI from 'openai';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    text: string;
    user: string;
    channel: string;
    ts: string;
  };
}

// YouTube URL extraction - supports all common YouTube URL formats
function extractVideoId(url: string): string | null {
  // Remove any whitespace and ensure URL is clean
  url = url.trim();
  
  console.log('Processing URL:', url);
  
  const patterns = [
    // Standard watch URLs
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/,
    
    // Short URLs
    /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
    
    // Embed URLs
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    
    // Old style URLs
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    
    // Mobile URLs
    /(?:https?:\/\/)?m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /(?:https?:\/\/)?m\.youtube\.com\/watch\?.*[&?]v=([a-zA-Z0-9_-]{11})/,
    
    // YouTube Music URLs
    /(?:https?:\/\/)?music\.youtube\.com\/watch\?v=([a-zA-Z0-Z_-]{11})/,
    
    // Gaming URLs  
    /(?:https?:\/\/)?gaming\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    
    // Shorts URLs
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    
    // If just video ID is provided
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      console.log('Extracted video ID:', match[1]);
      return match[1];
    }
  }
  
  console.log('No video ID found in URL:', url);
  return null;
}

// Get YouTube transcript
async function getTranscript(urlOrVideoId: string): Promise<string | null> {
  try {
    console.log('Attempting to fetch transcript for:', urlOrVideoId);
    const transcript = await YoutubeTranscript.fetchTranscript(urlOrVideoId);
    
    if (!transcript || transcript.length === 0) {
      console.log('Transcript is empty');
      return null;
    }
    
    console.log('Successfully fetched transcript, items count:', transcript.length);
    return transcript.map(item => item.text).join(' ');
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return null;
  }
}

// Summarize with OpenAI
async function summarizeContent(transcript: string, videoUrl: string): Promise<string> {
  try {
    const prompt = `
Please analyze and summarize the following YouTube video transcript in a structured markdown format. 
The summary should be comprehensive but well-organized, removing only unnecessary filler words while preserving all important information that can be applied to real life or work.

Requirements:
1. Use structured markdown with clear headings
2. Include key points, actionable insights, and practical applications
3. Organize content logically (main topics, subtopics, examples)
4. Keep important details and examples that help understanding
5. Make it scannable with bullet points where appropriate
6. Include any mentioned resources, tools, or references
7. Provide a brief conclusion with key takeaways

Video URL: ${videoUrl}

Transcript:
${transcript}

Please provide the summary in English, using clean markdown format.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert content summarizer who creates comprehensive, well-structured summaries that preserve practical value while improving readability."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    return response.choices[0].message.content || 'Failed to generate summary';
  } catch (error) {
    console.error('Error summarizing content:', error);
    return `Error creating summary: ${error}`;
  }
}

// Process YouTube URL
async function processYouTubeUrl(url: string): Promise<string> {
  // First try with original URL
  console.log('Processing original URL:', url);
  let transcript = await getTranscript(url);
  
  if (!transcript) {
    // If that fails, try with video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return 'Invalid YouTube URL format';
    }
    console.log('Trying with extracted video ID:', videoId);
    transcript = await getTranscript(videoId);
  }

  if (!transcript) {
    return 'Could not retrieve transcript for this video. The video might not have captions available.';
  }

  if (transcript.length < 50) {
    return 'Transcript is too short to summarize meaningfully';
  }

  const summary = await summarizeContent(transcript, url);
  
  return `# YouTube Video Summary

**Video URL:** ${url}
**Processing Time:** ${new Date().toISOString()}

---

${summary}

---
*Generated by YouTube Summarizer Bot*`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    let data: SlackEvent;

    try {
      data = JSON.parse(body);
    } catch {
      // Handle URL-encoded data
      const formData = new URLSearchParams(body);
      const payload = formData.get('payload');
      if (payload) {
        data = JSON.parse(payload);
      } else {
        return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
      }
    }

    // Handle URL verification challenge
    if (data.type === 'url_verification') {
      return NextResponse.json({ challenge: data.challenge });
    }

    // Handle app mention events
    if (data.type === 'event_callback' && data.event) {
      const event = data.event;
      
      if (event.type === 'app_mention') {
        const text = event.text || '';
        const user = event.user;
        const channel = event.channel;
        
        // Extract YouTube URL
        const urlPattern = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+/g;
        const urls = text.match(urlPattern);
        
        if (!urls) {
          await slack.chat.postMessage({
            channel,
            text: `<@${user}> Please provide a YouTube URL to summarize!\nUsage: @bot https://youtube.com/watch?v=...`
          });
        } else {
          const youtubeUrl = urls[0];
          
          // Send processing message
          await slack.chat.postMessage({
            channel,
            text: `<@${user}> Processing video: ${youtubeUrl}\n\nThis may take a moment...`
          });
          
          // Process video asynchronously
          try {
            const result = await processYouTubeUrl(youtubeUrl);
            
            await slack.chat.postMessage({
              channel,
              text: result
            });
          } catch (error) {
            await slack.chat.postMessage({
              channel,
              text: `<@${user}> Sorry, an error occurred while processing your request: ${error}`
            });
          }
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}