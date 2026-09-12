/*
Author       : OM Academy
Description  : Home page content: WhatsApp number, announcements and gallery photos
*/

// Enquiries are handed off to this WhatsApp number (Hisar center).
export const WHATSAPP_NUMBER = "919992887708";

// Pre-filled text for the Announcements "Get updates on WhatsApp" link.
export const WHATSAPP_UPDATES_TEXT = "Hi OM Academy, please send me updates on new batches, scholarships and notices.";

// Announcements, newest first; the first match is pinned as the latest notice.
// tag must be IMPORTANT, NOTICE, UPDATE or SCHOLARSHIP to appear under a filter; date is "DD Mon YYYY".
export const announcements = [
  { tag: "IMPORTANT", date: "23 Aug 2026", title: "Skill Assistant Fellowship in Advanced IT Learning (SAFAL) Scheme", desc: "Haryana Government is offering a 75% scholarship on course fee for eligible students under the SAFAL scheme. Apply before the last date." },
  { tag: "IMPORTANT", date: "20 May 2026", title: "New Batches Starting Soon!", desc: "Admissions open for various skill development courses. Secure your seat now." },
  { tag: "UPDATE", date: "18 May 2026", title: "Document Verification Drive", desc: "Document verification at all OM Academy centers from 20 May 2026." },
  { tag: "SCHOLARSHIP", date: "15 May 2026", title: "Scholarship Opportunity", desc: "Eligibility-based scholarship available for eligible students. Apply now." },
  { tag: "NOTICE", date: "12 May 2026", title: "Holiday Notice", desc: "All OM Academy centers will remain closed on 15 May 2026 (Friday)." },
];

export const announcementFilters = ["All", "Important", "Notice", "Update", "Scholarship"];

// Colour per announcement tag: a .tone-* class from scss/components/_tones.scss.
export const tagTones = {
  IMPORTANT: "green",
  NOTICE: "blue",
  UPDATE: "purple",
  SCHOLARSHIP: "amber",
};

// Gallery. Only the Hisar photo is real; the rest are Unsplash stand-ins until real photos arrive.
// Put real photos in src/assets/img/ and give them full (lightbox), card (grid) and thumb (lightbox strip) paths.
const unsplash = (id, width, quality) => "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + width + "&q=" + quality;

export const galleryItems = [
  { title: "OM Academy – Hisar Center", tag: "INFRASTRUCTURE", group: "Infrastructure", tone: "green", caption: "Hisar Center", full: "assets/img/om-academy-building.jpeg", card: "assets/img/om-academy-building-800.jpg", thumb: "assets/img/om-academy-building-800.jpg" },
  { title: "Digital Marketing Workshop", tag: "WORKSHOP", group: "Workshops", tone: "blue", photo: "1657812670261-7b76ba04525c" },
  { title: "Computer Lab Training", tag: "TRAINING", group: "Training Sessions", tone: "green", photo: "1569653402334-2e98fbaa80ee" },
  { title: "Certificate Distribution", tag: "EVENT", group: "Events", tone: "purple", photo: "1541339907198-e08756dedf3f" },
  { title: "Campus Placement Drive", tag: "PLACEMENT", group: "Placements", tone: "amber", photo: "1521791136064-7986c2920216" },
  { title: "Spoken English Class", tag: "TRAINING", group: "Training Sessions", tone: "green", photo: "1522202176988-66273c2fd55f" },
  { title: "Web Development Workshop", tag: "WORKSHOP", group: "Workshops", tone: "blue", photo: "1522071820081-009f0129c71c" },
  { title: "Hardware & Networking Lab", tag: "TRAINING", group: "Training Sessions", tone: "green", photo: "1544197150-b99a580bb7a8" },
].map((item, index) => Object.assign({}, item, { index }, item.photo
  ? { caption: "Representative photo", full: unsplash(item.photo, 1400, 75), card: unsplash(item.photo, 600, 60), thumb: unsplash(item.photo, 200, 60) }
  : {}));

export const galleryFilters = ["All", "Events", "Training Sessions", "Workshops", "Placements", "Infrastructure"];
