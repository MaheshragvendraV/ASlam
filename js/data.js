/* =====================================================================
   TIPTANGLE — OWNER-EDITABLE CONTENT
   ---------------------------------------------------------------------
   Everything the agency owner needs to change lives in this one file.
   Replace any text inside "quotes". Items marked  ______  or
   "Package Name #1" etc. are BLANKS meant to be filled in by you.
   Images: paste any image URL (or a path such as "assets/my-photo.jpg").
   ===================================================================== */

const U = (id, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=75`;

const SITE = {
  /* ---------------- Agency basics ---------------- */
  agency: {
    name: "Tiptangle",
    tagline: "Most Affordable · Flexible Packages · You're in Safe Hands",
    logo: "assets/logo.png",            // your logo file (falls back to assets/logo.svg if missing)
    watermark: true,                    // show the logo badge on every image
    phone: "+91 00000 00000",           // ______ your phone
    whatsapp: "910000000000",           // ______ country code + number, digits only
    email: "hello@yourdomain.com",      // ______ your email
    address: "______ Street, ______ City, ______ State, ______ PIN",
    hours: "Mon – Sun · 9:00 AM – 9:00 PM",
    mapEmbed: "https://www.google.com/maps?q=India&output=embed", // replace with your Google Maps embed URL
    social: { instagram: "#", facebook: "#", youtube: "#", x: "#" },
    currency: "₹",
  },

  /* ---------------- Enquiry form ----------------
     enquiryMode: "whatsapp" | "email" | "formspree" | "netlify"
     formspreeEndpoint: e.g. "https://formspree.io/f/xxxxxxx"            */
  enquiryMode: "whatsapp",
  formspreeEndpoint: "",

  /* ---------------- Promo code ---------------- */
  promo: { code: "______", text: "Use this code on your first booking and save", discount: "__%" },

  /* ---------------- Budget meter ---------------- */
  budget: { min: 5000, max: 300000, step: 5000, start: 60000 },

  /* ---------------- Hero slideshow ---------------- */
  hero: [
    { img: U("photo-1506905925346-21bda4d32df4", 1920), caption: "Hill Stations" },
    { img: U("photo-1507525428034-b723cf961d3e", 1920), caption: "Beaches & Islands" },
    { img: U("photo-1524492412937-b28074a5d7da", 1920), caption: "Heritage of India" },
    { img: U("photo-1512453979798-5ea266f8880c", 1920), caption: "International Escapes" },
    { img: U("photo-1514282401047-d79a71a590e8", 1920), caption: "Honeymoon Paradise" },
  ],
  heroWords: ["Hill Stations", "Honeymoons", "Family Holidays", "Bachelor Trips", "Overseas Cruises", "College IVs", "Solo Adventures"],

  /* ---------------- Most experienced places (infinite loop) ----------------
     Fill in the places you've travelled to the most.                       */
  topPlaces: [
    { name: "Top Place #1", note: "______ trips completed", img: U("photo-1602216056096-3b40cc0c9944", 600) },
    { name: "Top Place #2", note: "______ trips completed", img: U("photo-1477587458883-47145ed94245", 600) },
    { name: "Top Place #3", note: "______ trips completed", img: U("photo-1537996194471-e657df975ab4", 600) },
    { name: "Top Place #4", note: "______ trips completed", img: U("photo-1476514525535-07fb3b4ae5f1", 600) },
    { name: "Top Place #5", note: "______ trips completed", img: U("photo-1502602898657-3e91760cbb34", 600) },
    { name: "Top Place #6", note: "______ trips completed", img: U("photo-1564507592333-c60657eea523", 600) },
    { name: "Top Place #7", note: "______ trips completed", img: U("photo-1523906834658-6e24ef2386f9", 600) },
    { name: "Top Place #8", note: "______ trips completed", img: U("photo-1570168007204-dfb528c6958f", 600) },
  ],

  /* ---------------- Travel scope ---------------- */
  scopes: [
    { id: "intrastate", label: "Within the State", icon: "fa-location-dot",
      desc: "Weekend getaways and short drives inside your own state.",
      places: [
        { name: "Destination #1", img: U("photo-1602216056096-3b40cc0c9944", 700) },
        { name: "Destination #2", img: U("photo-1593693397690-362cb9666fc2", 700) },
        { name: "Destination #3", img: U("photo-1470770841072-f978cf4d019e", 700) } ] },
    { id: "interstate", label: "Across States", icon: "fa-road",
      desc: "Road trips and rail journeys across neighbouring states.",
      places: [
        { name: "Destination #1", img: U("photo-1477587458883-47145ed94245", 700) },
        { name: "Destination #2", img: U("photo-1506905925346-21bda4d32df4", 700) },
        { name: "Destination #3", img: U("photo-1469854523086-cc02fe5d8800", 700) } ] },
    { id: "country", label: "Across the Country", icon: "fa-map",
      desc: "North to South, East to West — the whole country in one plan.",
      places: [
        { name: "Destination #1", img: U("photo-1524492412937-b28074a5d7da", 700) },
        { name: "Destination #2", img: U("photo-1476514525535-07fb3b4ae5f1", 700) },
        { name: "Destination #3", img: U("photo-1564507592333-c60657eea523", 700) } ] },
    { id: "abroad", label: "International / Abroad", icon: "fa-earth-asia",
      desc: "Visa help, forex, flights and hotels — handled end-to-end.",
      places: [
        { name: "Destination #1", img: U("photo-1512453979798-5ea266f8880c", 700) },
        { name: "Destination #2", img: U("photo-1502602898657-3e91760cbb34", 700) },
        { name: "Destination #3", img: U("photo-1537996194471-e657df975ab4", 700) } ] },
    { id: "overseas", label: "Overseas & Offshore", icon: "fa-ship",
      desc: "Cruises, island hopping and offshore escapes across the seas.",
      places: [
        { name: "Destination #1", img: U("photo-1548574505-5e239809ee19", 700) },
        { name: "Destination #2", img: U("photo-1514282401047-d79a71a590e8", 700) },
        { name: "Destination #3", img: U("photo-1523906834658-6e24ef2386f9", 700) } ] },
  ],

  /* ---------------- Themes ---------------- */
  themes: [
    { id: "cultural", label: "Cultural Hangouts", img: U("photo-1514222134-b57cbb8ce073", 800), line: "Festivals, folk dance & living traditions" },
    { id: "hills", label: "Hill Stations", img: U("photo-1506905925346-21bda4d32df4", 800), line: "Misty peaks, tea gardens & cool air" },
    { id: "couple", label: "Couple Destinations", img: U("photo-1516589178581-6cd7833ae3b2", 800), line: "Quiet corners made for two" },
    { id: "historic", label: "Historic Themed", img: U("photo-1524492412937-b28074a5d7da", 800), line: "Forts, palaces & timeless monuments" },
    { id: "bachelor", label: "Bachelor Party Places", img: U("photo-1533174072545-7a4b6ad7a6c3", 800), line: "Beaches, nightlife & non-stop fun" },
    { id: "honeymoon", label: "Honeymoon Destinations", img: U("photo-1514282401047-d79a71a590e8", 800), line: "Sunsets, villas & forever memories" },
    { id: "beach", label: "Beaches & Islands", img: U("photo-1507525428034-b723cf961d3e", 800), line: "Sand, sea & sun on repeat" },
    { id: "adventure", label: "Adventure", img: U("photo-1544551763-46a013bb70d5", 800), line: "Treks, rafting & scuba dives" },
  ],

  /* ---------------- Trip types ---------------- */
  tripTypes: [
    { id: "solo", label: "Solo Trips", icon: "fa-person-hiking", img: U("photo-1503220317375-aaad61436b1b", 700) },
    { id: "family", label: "Family Trips", icon: "fa-people-roof", img: U("photo-1511895426328-dc8714191300", 700) },
    { id: "friends", label: "Friends Trips", icon: "fa-user-group", img: U("photo-1527631746610-bca00a040d60", 700) },
    { id: "bachelor", label: "Bachelor's Trips", icon: "fa-champagne-glasses", img: U("photo-1539635278303-d4002c07eae3", 700) },
    { id: "honeymoon", label: "Honeymoon Trips", icon: "fa-heart", img: U("photo-1518548419970-58e3b4079ab2", 700) },
    { id: "college", label: "College IV", icon: "fa-graduation-cap", img: U("photo-1523050854058-8df90110c9f1", 700) },
    { id: "school", label: "School IV", icon: "fa-school", img: U("photo-1503676260728-1c00da094a0b", 700) },
    { id: "corporate", label: "Corporate Trips", icon: "fa-briefcase", img: U("photo-1529156069898-49953e39b3ac", 700) },
  ],

  /* ---------------- Packages ----------------
     Give each package an attractive name, price, rating & details.
     tripType: one of the tripTypes ids · scope: one of the scopes ids
     flexibility: "Fully Flexible" | "Partially Flexible"
     transport: any of "flight","train","bus","car","cruise","tempo"      */
  packages: [
    { name: "Package Name #1", tripType: "honeymoon", scope: "abroad", theme: "honeymoon", price: 95000, days: "6D / 5N", rating: 4.9, flexibility: "Fully Flexible", transport: ["flight", "car", "cruise"], img: U("photo-1514282401047-d79a71a590e8", 800) },
    { name: "Package Name #2", tripType: "family", scope: "country", theme: "hills", price: 32000, days: "5D / 4N", rating: 4.8, flexibility: "Fully Flexible", transport: ["train", "car", "tempo"], img: U("photo-1506905925346-21bda4d32df4", 800) },
    { name: "Package Name #3", tripType: "friends", scope: "interstate", theme: "beach", price: 18000, days: "4D / 3N", rating: 4.7, flexibility: "Partially Flexible", transport: ["bus", "car", "tempo"], img: U("photo-1507525428034-b723cf961d3e", 800) },
    { name: "Package Name #4", tripType: "bachelor", scope: "interstate", theme: "bachelor", price: 24000, days: "3D / 2N", rating: 4.6, flexibility: "Fully Flexible", transport: ["flight", "car"], img: U("photo-1533174072545-7a4b6ad7a6c3", 800) },
    { name: "Package Name #5", tripType: "solo", scope: "country", theme: "adventure", price: 15000, days: "4D / 3N", rating: 4.8, flexibility: "Fully Flexible", transport: ["train", "bus"], img: U("photo-1503220317375-aaad61436b1b", 800) },
    { name: "Package Name #6", tripType: "college", scope: "intrastate", theme: "historic", price: 6500, days: "2D / 1N", rating: 4.7, flexibility: "Partially Flexible", transport: ["bus", "tempo"], img: U("photo-1523050854058-8df90110c9f1", 800) },
    { name: "Package Name #7", tripType: "school", scope: "intrastate", theme: "cultural", price: 5000, days: "1D", rating: 4.9, flexibility: "Partially Flexible", transport: ["bus"], img: U("photo-1503676260728-1c00da094a0b", 800) },
    { name: "Package Name #8", tripType: "family", scope: "overseas", theme: "beach", price: 185000, days: "8D / 7N", rating: 4.9, flexibility: "Fully Flexible", transport: ["flight", "cruise", "car"], img: U("photo-1548574505-5e239809ee19", 800) },
    { name: "Package Name #9", tripType: "honeymoon", scope: "country", theme: "couple", price: 45000, days: "5D / 4N", rating: 4.8, flexibility: "Fully Flexible", transport: ["flight", "car"], img: U("photo-1602216056096-3b40cc0c9944", 800) },
    { name: "Package Name #10", tripType: "friends", scope: "abroad", theme: "adventure", price: 78000, days: "6D / 5N", rating: 4.7, flexibility: "Partially Flexible", transport: ["flight", "car"], img: U("photo-1537996194471-e657df975ab4", 800) },
    { name: "Package Name #11", tripType: "corporate", scope: "country", theme: "historic", price: 38000, days: "3D / 2N", rating: 4.6, flexibility: "Fully Flexible", transport: ["flight", "tempo", "bus"], img: U("photo-1524492412937-b28074a5d7da", 800) },
    { name: "Package Name #12", tripType: "family", scope: "abroad", theme: "cultural", price: 125000, days: "7D / 6N", rating: 4.8, flexibility: "Fully Flexible", transport: ["flight", "train", "car"], img: U("photo-1502602898657-3e91760cbb34", 800) },
  ],

  /* Default details shown in every package's catalog pop-up.
     You can add the same keys to an individual package to override them. */
  packageDefaults: {
    itinerary: [
      { day: "Day 1", time: "__:__ AM – __:__ PM", plan: "______ (pick-up, check-in, sightseeing…)" },
      { day: "Day 2", time: "__:__ AM – __:__ PM", plan: "______" },
      { day: "Day 3", time: "__:__ AM – __:__ PM", plan: "______" },
      { day: "Final day", time: "__:__ AM – __:__ PM", plan: "______ (check-out & safe drop)" },
    ],
    vehicle: "______ (e.g. AC SUV / Tempo Traveller) · Driver allowance: ______ · Toll & parking: ______",
    food: "______ (breakfast / lunch / dinner, local specialities to try)",
    advantages: "______ (why this place is special, best season, highlights)",
    inclusions: ["______", "______", "______"],
    exclusions: ["______", "______"],
  },

  /* ---------------- Fleet ---------------- */
  fleet: [
    { name: "Sedan", icon: "fa-car-side", seats: "4", ac: "AC", allowance: "______", img: U("photo-1549317661-bd32c8ce0db2", 700) },
    { name: "SUV", icon: "fa-car", seats: "6–7", ac: "AC", allowance: "______", img: U("photo-1519641471654-76ce0107ad1b", 700) },
    { name: "Tempo Traveller", icon: "fa-van-shuttle", seats: "12–17", ac: "AC / Non-AC", allowance: "______", img: U("photo-1469854523086-cc02fe5d8800", 700) },
    { name: "Luxury Coach", icon: "fa-bus", seats: "35–50", ac: "AC", allowance: "______", img: U("photo-1544620347-c4fd4a3d5957", 700) },
    { name: "Flights (partner)", icon: "fa-plane", seats: "Any", ac: "—", allowance: "______", img: U("photo-1436491865332-7a61a109cc05", 700) },
    { name: "Trains (partner)", icon: "fa-train", seats: "Any", ac: "Sleeper / AC", allowance: "______", img: U("photo-1474487548417-781cb71495f3", 700) },
    { name: "Cruises (partner)", icon: "fa-ship", seats: "Any", ac: "—", allowance: "______", img: U("photo-1548574505-5e239809ee19", 700) },
  ],

  /* ---------------- Your journey with us (trust timeline) ---------------- */
  journey: [
    { icon: "fa-comments", title: "You tell us your dream", text: "Share your budget, dates and mood. A dedicated travel expert calls you back." },
    { icon: "fa-pen-ruler", title: "We craft your plan", text: "A custom catalog with day-by-day timings, stays, food and multiple transport options." },
    { icon: "fa-handshake", title: "Negotiate & confirm", text: "Every package is flexible. Adjust, negotiate and confirm only when you're 100% happy." },
    { icon: "fa-car-side", title: "Doorstep pick-up", text: "Our own vehicles and verified drivers pick you up right on time." },
    { icon: "fa-headset", title: "24×7 on-trip support", text: "A real person is one call away during your whole journey." },
    { icon: "fa-house-chimney", title: "Safe return home", text: "We drop you back home safely and check in after your trip." },
    { icon: "fa-star", title: "Memories forever", text: "Share your photos and rating. You'll travel with us again!" },
  ],

  /* ---------------- How it works (fill later) ---------------- */
  steps: [
    { title: "Step #1", text: "______" },
    { title: "Step #2", text: "______" },
    { title: "Step #3", text: "______" },
    { title: "Step #4", text: "______" },
  ],

  /* ---------------- Advantages ---------------- */
  advantages: [
    { icon: "fa-indian-rupee-sign", title: "Most Affordable", text: "Honest pricing with no hidden charges — best value guaranteed." },
    { icon: "fa-sliders", title: "Flexible Packages", text: "Fully and partially flexible plans, built around you." },
    { icon: "fa-shield-heart", title: "You're in Safe Hands", text: "Verified drivers, trusted stays and 24×7 support." },
    { icon: "fa-route", title: "End-to-End Service", text: "Tickets, stays, food, sightseeing and drop — all handled." },
    { icon: "fa-van-shuttle", title: "Our Own Vehicles", text: "Sedans to coaches — clean, maintained and on time." },
    { icon: "fa-shuffle", title: "Multi-mode Transport", text: "Flight, train, bus, car or cruise — mix them in one trip." },
  ],

  /* ---------------- Milestones ---------------- */
  stats: [
    { value: 0, suffix: "+", label: "Happy Travellers" },   // ______ replace 0 with your number
    { value: 0, suffix: "+", label: "Trips Completed" },
    { value: 0, suffix: "+", label: "Destinations" },
    { value: 0, suffix: "", label: "Years of Trust" },
  ],
  milestones: [
    { year: "____", title: "Milestone #1", text: "______", img: U("photo-1488646953014-85cb44e25828", 700) },
    { year: "____", title: "Milestone #2", text: "______", img: U("photo-1530789253388-582c481c54b0", 700) },
    { year: "____", title: "Milestone #3", text: "______", img: U("photo-1529156069898-49953e39b3ac", 700) },
    { year: "____", title: "Milestone #4", text: "______", img: U("photo-1436491865332-7a61a109cc05", 700) },
  ],

  /* ---------------- Travel blog & food guide ---------------- */
  blog: [
    { title: "Your Blog Title #1", date: "__ / __ / ____", excerpt: "______", img: U("photo-1476514525535-07fb3b4ae5f1", 700), link: "#" },
    { title: "Your Blog Title #2", date: "__ / __ / ____", excerpt: "______", img: U("photo-1530789253388-582c481c54b0", 700), link: "#" },
    { title: "Your Blog Title #3", date: "__ / __ / ____", excerpt: "______", img: U("photo-1488646953014-85cb44e25828", 700), link: "#" },
  ],
  food: [
    { place: "Place #1", dish: "______", text: "______", img: U("photo-1504674900247-0877df9cc836", 700) },
    { place: "Place #2", dish: "______", text: "______", img: U("photo-1414235077428-338989a2e8c0", 700) },
    { place: "Place #3", dish: "______", text: "______", img: U("photo-1565299624946-b28f40a0ae38", 700) },
  ],

  /* ---------------- Testimonials ---------------- */
  testimonials: [
    { name: "Customer Name #1", trip: "______ Trip", rating: 5, text: "______ (customer's review goes here)" },
    { name: "Customer Name #2", trip: "______ Trip", rating: 5, text: "______ (customer's review goes here)" },
    { name: "Customer Name #3", trip: "______ Trip", rating: 5, text: "______ (customer's review goes here)" },
  ],

  /* ---------------- Live "safe hands" toasts ---------------- */
  toasts: [
    "A family just planned a hill-station holiday 🏔️",
    "A couple booked their dream honeymoon 💑",
    "A college group confirmed their IV trip 🎓",
    "Friends just locked a beach getaway 🏖️",
  ],
};
