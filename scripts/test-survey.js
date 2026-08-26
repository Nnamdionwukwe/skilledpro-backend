// scripts/test-survey.js
// Run: node scripts/test-survey.js

const BASE_URL = process.env.API_URL || "http://localhost:5000/api";

async function testSurvey() {
  console.log("🧪 Testing Survey API...\n");

  // Test 1: Submit survey
  console.log("📝 Testing survey submission...");
  const surveyData = {
    role: "hirer",
    industry: "plumbing",
    experience: "intermediate",
    problem:
      "I struggle to find reliable plumbers for my clients. Many show up late or do poor quality work.",
    feature:
      "A real-time worker availability tracker with verified reviews would make me use this platform daily.",
    concern: "reliability",
    hearAbout: "google",
    email: "test@example.com",
    name: "Test User",
    phone: "+2348012345678",
    location: "Lagos, Nigeria",
    additionalFeedback: "Great platform, looking forward to using it!",
    rating: 5,
  };

  try {
    const res = await fetch(`${BASE_URL}/survey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(surveyData),
    });

    const data = await res.json();
    console.log("✅ Survey submitted:", data);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }

  console.log("\n✅ Test complete!");
}

testSurvey();
