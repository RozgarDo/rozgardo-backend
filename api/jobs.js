export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Mock Job Data
  const jobs = [
    {
      id: "1",
      title: "Full Stack Developer",
      employer_name: "TechCorp",
      location: "Remote",
      salary: "₹1,20,000",
      job_type: "Full-time",
      category: "IT / Software",
      description: "Join our dynamic team building the future of web applications."
    },
    {
      id: "2",
      title: "Delivery Partner",
      employer_name: "QuickDrop",
      location: "Gurgaon",
      salary: "₹25,000",
      job_type: "Part-time",
      category: "Logistics",
      description: "Fast-paced delivery role in the heart of Gurgaon."
    },
    {
      id: "3",
      title: "Store Assistant",
      employer_name: "Modern Retail",
      location: "Bangalore",
      salary: "₹18,000",
      job_type: "Full-time",
      category: "Retail",
      description: "Assist in day-to-day store operations and inventory management."
    }
  ];

  return res.status(200).json(jobs);
}
