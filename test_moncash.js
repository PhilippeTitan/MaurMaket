const fs = require('fs');

async function testMonCashConnect() {
  const secretKey = "sk_proj_a930a9851740748787e2eef1a88d05ed7559e1b1d9aeb333";
  const url = "https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1/pay-create";

  console.log("Sending request to MonCashConnect...");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: 50, // Test amount
        referenceId: `test_order_${Date.now()}`,
        returnUrl: "https://votresite.com/merci",
      }),
    });

    const text = await res.text();
    console.log("Response status:", res.status);
    console.log("Response headers:", [...res.headers.entries()]);
    console.log("Response text:", text);
    
    try {
      const data = JSON.parse(text);
      console.log("Parsed JSON Data:", data);
      if (data.paymentUrl) {
        console.log("SUCCESS! Payment URL is:", data.paymentUrl);
      }
    } catch (e) {
      console.log("Response is not JSON, could be an error page.");
    }
  } catch (error) {
    console.error("Fetch request failed:", error);
  }
}

testMonCashConnect();
