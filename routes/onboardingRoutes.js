const express = require('express');
const router = express.Router();

// Launching soon page
router.get('/', (req, res) => {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RozgarDo - Onboarding Coming Soon</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }
            
            .container {
                text-align: center;
                background: white;
                padding: 60px 40px;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                max-width: 500px;
                animation: slideUp 0.6s ease-out;
            }
            
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .logo {
                font-size: 48px;
                margin-bottom: 20px;
            }
            
            h1 {
                color: #333;
                font-size: 32px;
                margin-bottom: 15px;
                font-weight: 700;
            }
            
            .subtitle {
                color: #667eea;
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 20px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            
            p {
                color: #666;
                font-size: 16px;
                line-height: 1.6;
                margin-bottom: 30px;
            }
            
            .features {
                text-align: left;
                background: #f8f9fa;
                padding: 25px;
                border-radius: 12px;
                margin: 30px 0;
            }
            
            .features h3 {
                color: #333;
                font-size: 16px;
                margin-bottom: 15px;
            }
            
            .feature-item {
                color: #555;
                padding: 10px 0;
                display: flex;
                align-items: center;
                font-size: 14px;
            }
            
            .feature-item:before {
                content: '✓';
                color: #667eea;
                font-weight: bold;
                margin-right: 10px;
                font-size: 18px;
            }
            
            .email-signup {
                display: flex;
                gap: 10px;
                margin: 30px 0;
                flex-wrap: wrap;
                justify-content: center;
            }
            
            .email-signup input {
                flex: 1;
                min-width: 200px;
                padding: 12px 16px;
                border: 2px solid #ddd;
                border-radius: 8px;
                font-size: 14px;
                transition: border-color 0.3s;
            }
            
            .email-signup input:focus {
                outline: none;
                border-color: #667eea;
            }
            
            .email-signup button {
                padding: 12px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                white-space: nowrap;
            }
            
            .email-signup button:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
            }
            
            .countdown {
                font-size: 12px;
                color: #999;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🚀</div>
            
            <div class="subtitle">Coming Soon</div>
            <h1>Onboarding Portal</h1>
            <p>We're preparing an amazing onboarding experience for you. Get ready to unlock your potential with RozgarDo!</p>
            
            <div class="features">
                <h3>What's Coming:</h3>
                <div class="feature-item">Guided setup wizard</div>
                <div class="feature-item">Profile optimization tips</div>
                <div class="feature-item">Job matching recommendations</div>
                <div class="feature-item">24/7 support</div>
            </div>
            
            <div class="email-signup">
                <input type="email" placeholder="Enter your email" id="emailInput">
                <button onclick="notifyMe()">Notify Me</button>
            </div>
            
            <div class="countdown">
                Expected launch: Coming next month
            </div>
        </div>
        
        <script>
            function notifyMe() {
                const email = document.getElementById('emailInput').value;
                if (email.includes('@')) {
                    alert('Thank you! We will notify you when onboarding is ready.');
                    document.getElementById('emailInput').value = '';
                } else {
                    alert('Please enter a valid email address');
                }
            }
            
            document.getElementById('emailInput').addEventListener('keypress', function(event) {
                if (event.key === 'Enter') {
                    notifyMe();
                }
            });
        </script>
    </body>
    </html>
    `;
    res.send(htmlContent);
});

// API endpoint for onboarding status
router.get('/status', (req, res) => {
    res.json({
        status: 'launching_soon',
        message: 'Onboarding portal is coming soon',
        expectedLaunch: 'Coming next month',
        features: [
            'Guided setup wizard',
            'Profile optimization tips',
            'Job matching recommendations',
            '24/7 support'
        ]
    });
});

module.exports = router;
