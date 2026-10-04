/** The only state this portal accepts enrollments for. */
export const FIXED_STATE = "Tamil Nadu" as const;

/** Revenue districts of Tamil Nadu (enroll form dropdown). */
export const TAMIL_NADU_DISTRICTS = [
  "Ariyalur",
  "Chengalpattu",
  "Chennai",
  "Coimbatore",
  "Cuddalore",
  "Dharmapuri",
  "Dindigul",
  "Erode",
  "Kallakurichi",
  "Kanchipuram",
  "Kanyakumari",
  "Karur",
  "Krishnagiri",
  "Madurai",
  "Mayiladuthurai",
  "Nagapattinam",
  "Namakkal",
  "Nilgiris",
  "Perambalur",
  "Pudukkottai",
  "Ramanathapuram",
  "Ranipet",
  "Salem",
  "Sivaganga",
  "Tenkasi",
  "Thanjavur",
  "Theni",
  "Thoothukudi",
  "Tiruchirappalli",
  "Tirunelveli",
  "Tirupathur",
  "Tiruppur",
  "Tiruvallur",
  "Tiruvannamalai",
  "Tiruvarur",
  "Vellore",
  "Viluppuram",
  "Virudhunagar",
] as const;

export const PHOTO_BUCKET = "member-photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Profile photo: JPG/JPEG and PNG only (QA BUG-002). */
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png"];
export const ALLOWED_PHOTO_EXTENSIONS = ["jpg", "jpeg", "png"];

// NOTE: the 234-seat constituency (தொகுதி) map that lived here was removed
// for QA BUG-015 — பகுதி is now a free-text input. The full list is backed up
// in backup/constants-with-constituency-list.ts with restore steps in
// backup/CONSTITUENCY-BACKUP-README.md.

