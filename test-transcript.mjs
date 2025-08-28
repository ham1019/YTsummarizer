import { fetchTranscript } from 'youtube-transcript-plus';

async function testTranscript() {
  console.log('Starting YouTube transcript test...');
  
  // Test with videos that definitely should have transcripts
  const testVideos = [
    {
      name: 'Google Chrome Ad (very likely to have transcripts)',
      url: 'https://www.youtube.com/watch?v=nCgQDjiotG0', // Google's official ad
      videoId: 'nCgQDjiotG0'
    },
    {
      name: 'Popular educational video',
      url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', // Luis Fonsi - Despacito (very popular, likely auto-generated)
      videoId: 'kJQP7kiw5Fk'
    },
    {
      name: 'YouTube Official Video',
      url: 'https://www.youtube.com/watch?v=oHg5SJYRHA0', // RickRoll but different video
      videoId: 'oHg5SJYRHA0'
    },
    {
      name: 'The user provided video',
      url: 'https://www.youtube.com/watch?v=3YCvlxKDFd4',
      videoId: '3YCvlxKDFd4'
    }
  ];

  for (const video of testVideos) {
    console.log(`\n=== Testing: ${video.name} ===`);
    console.log(`URL: ${video.url}`);
    console.log(`Video ID: ${video.videoId}`);
    
    // Test with full URL
    console.log('\n1. Testing with full URL:');
    try {
      const transcript1 = await fetchTranscript(video.url);
      console.log(`✅ SUCCESS with URL! Found ${transcript1.length} transcript items`);
      if (transcript1.length > 0) {
        console.log('First few items:', transcript1.slice(0, 3).map(item => item.caption || item.text).join(' '));
      }
    } catch (error) {
      console.log('❌ FAILED with URL:', error.message);
    }
    
    // Test with video ID only
    console.log('\n2. Testing with video ID only:');
    try {
      const transcript2 = await fetchTranscript(video.videoId);
      console.log(`✅ SUCCESS with video ID! Found ${transcript2.length} transcript items`);
      if (transcript2.length > 0) {
        console.log('First few items:', transcript2.slice(0, 3).map(item => item.caption || item.text).join(' '));
      }
    } catch (error) {
      console.log('❌ FAILED with video ID:', error.message);
    }
    
    console.log('\n' + '='.repeat(50));
  }
}

testTranscript().catch(console.error);