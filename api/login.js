export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { email, password } = req.body;

  // Simple mock authentication
  if (email === "demo@rozgardo.com" && password === "demo123") {
    return res.status(200).json({
      success: true,
      user: {
        id: "mock-user-123",
        name: "Demo User",
        email: "demo@rozgardo.com",
        role: "employee"
      },
      token: "mock-jwt-token"
    });
  }

  return res.status(401).json({
    success: false,
    message: "Invalid credentials"
  });
}
