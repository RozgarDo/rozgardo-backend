const supabase = require('./supabaseClient');

async function addMoreJobs() {
    // Get the employer ID
    const { data: employer } = await supabase.from('users').select('id').eq('phone', '8888888888').single();
    if (!employer) { console.error("Employer not found! Run seed.js first."); return; }

    const moreJobs = [
        { title: 'Personal Chef for Family', category: 'Cook', salary: 30000, location: 'Delhi', description: 'Looking for an experienced home cook who can prepare North Indian and Continental dishes for a family of 4. Must maintain kitchen hygiene.', status: 'approved', employer_id: employer.id },
        { title: 'House Cleaner (Full-Time)', category: 'Cleaner', salary: 12000, location: 'Bangalore', description: 'Need a reliable full-time house cleaner for a 3BHK apartment. Working hours 8am-2pm, 6 days a week.', status: 'approved', employer_id: employer.id },
        { title: 'Office Helper / Peon', category: 'Helper', salary: 15000, location: 'Mumbai', description: 'Office helper needed for a corporate office. Duties include serving tea/coffee, photocopying, courier handling, and general housekeeping.', status: 'approved', employer_id: employer.id },
        { title: 'Delivery Driver (Part-Time)', category: 'Driver', salary: 20000, location: 'Pune', description: 'Part-time delivery driver with own two-wheeler. Evening shift 5pm-10pm. Fuel allowance provided.', status: 'approved', employer_id: employer.id },
        { title: 'Warehouse Security (Night Shift)', category: 'Security', salary: 22000, location: 'Chennai', description: 'Night shift security guard for industrial warehouse. Must be able to stay alert during 10pm-6am shift. CCTV monitoring experience preferred.', status: 'pending', employer_id: employer.id },
        { title: 'Event Cook (Weekend Only)', category: 'Cook', salary: 8000, location: 'Hyderabad', description: 'Cook needed for weekend catering events. Must be able to prepare food for 50-100 people. South Indian cuisine expertise required.', status: 'pending', employer_id: employer.id },
    ];

    const { data, error } = await supabase.from('jobs').insert(moreJobs).select();
    if (error) {
        console.error("Error adding jobs:", error.message);
    } else {
        console.log(`Added ${data.length} more jobs successfully!`);
        console.log("Approved jobs (visible to employees): 4");
        console.log("Pending jobs (need admin approval): 2");
    }
}

addMoreJobs();
