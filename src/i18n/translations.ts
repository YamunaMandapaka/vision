export type Language = 'en' | 'hi' | 'te' | 'ta';

interface Translations {
  // Common
  loading: string;
  error: string;
  offline_ready: string;
  
  // Crop Scan Tab
  crop_scanner: string;
  take_photo_description: string;
  open_camera: string;
  upload_photo: string;
  capture_photo: string;
  analyzing_crop: string;
  analyzing_description: string;
  scan_another_crop: string;
  save_to_calendar: string;
  saved_to_calendar: string;
  read_aloud: string;
  stop_reading: string;
  
  // Model Loading
  downloading_model: string;
  loading_model: string;
  load_model: string;
  
  // Errors
  camera_permission_denied: string;
  camera_not_found: string;
  camera_in_use: string;
  camera_not_ready: string;
  failed_to_load_model: string;
  analysis_error: string;
  
  // Results
  disease_name: string;
  severity: string;
  affected_area: string;
  treatment_steps: string;
  recommended_products: string;
  prevention_tips: string;
  
  // Severity levels
  severity_critical: string;
  severity_high: string;
  severity_medium: string;
  severity_low: string;
  severity_healthy: string;
}

export const translations: Record<Language, Translations> = {
  en: {
    // Common
    loading: 'Loading',
    error: 'Error',
    offline_ready: '✈️ Offline Ready',
    
    // Crop Scan Tab
    crop_scanner: '📷 Crop Scanner',
    take_photo_description: 'Take a photo of your crop to detect diseases',
    open_camera: '📸 Open Camera',
    upload_photo: '🖼️ Upload Photo',
    capture_photo: '📸 Capture Photo',
    analyzing_crop: 'Analyzing your crop...',
    analyzing_description: 'Our AI is examining the image for diseases and health indicators',
    scan_another_crop: '🔄 Scan Another Crop',
    save_to_calendar: '💾 Save to Calendar',
    saved_to_calendar: 'Saved to calendar!',
    read_aloud: '🔊 Read Aloud',
    stop_reading: '⏸️ Stop Reading',
    
    // Model Loading
    downloading_model: '⬇️ Downloading AI Model...',
    loading_model: '🔄 Loading AI Model...',
    load_model: 'Load AI Model',
    
    // Errors
    camera_permission_denied: 'Please allow camera access to scan crops',
    camera_not_found: 'No camera found on this device',
    camera_in_use: 'Camera is in use by another application',
    camera_not_ready: 'Camera not ready. Please wait a moment and try again.',
    failed_to_load_model: 'Failed to load AI model',
    analysis_error: 'Could not analyze image. Please try again.',
    
    // Results
    disease_name: 'Disease Name',
    severity: 'Severity',
    affected_area: 'Affected Area',
    treatment_steps: '💊 Treatment Steps',
    recommended_products: '🧪 Recommended Products',
    prevention_tips: '🛡️ Prevention Tips',
    
    // Severity levels
    severity_critical: 'Critical',
    severity_high: 'High',
    severity_medium: 'Medium',
    severity_low: 'Low',
    severity_healthy: 'Healthy',
  },
  
  hi: {
    // Common
    loading: 'लोड हो रहा है',
    error: 'त्रुटि',
    offline_ready: '✈️ इंटरनेट की जरूरत नहीं',
    
    // Crop Scan Tab
    crop_scanner: '📷 फसल जांच',
    take_photo_description: 'रोगों का पता लगाने के लिए अपनी फसल की फोटो लें',
    open_camera: '📸 कैमरा खोलें',
    upload_photo: '🖼️ फोटो अपलोड करें',
    capture_photo: '📸 फोटो खींचें',
    analyzing_crop: 'आपकी फसल की जांच हो रही है...',
    analyzing_description: 'हमारी कृत्रिम बुद्धिमत्ता रोगों और स्वास्थ्य संकेतों के लिए तस्वीर की जांच कर रही है',
    scan_another_crop: '🔄 दूसरी फसल की जांच करें',
    save_to_calendar: '💾 कैलेंडर में सहेजें',
    saved_to_calendar: 'कैलेंडर में सहेज लिया गया!',
    read_aloud: '🔊 जोर से पढ़ें',
    stop_reading: '⏸️ पढ़ना बंद करें',
    
    // Model Loading
    downloading_model: '⬇️ कृत्रिम बुद्धिमत्ता डाउनलोड हो रही है...',
    loading_model: '🔄 कृत्रिम बुद्धिमत्ता तैयार हो रही है...',
    load_model: 'कृत्रिम बुद्धिमत्ता शुरू करें',
    
    // Errors
    camera_permission_denied: 'कृपया फसल जांच के लिए कैमरा की अनुमति दें',
    camera_not_found: 'इस उपकरण में कोई कैमरा नहीं मिला',
    camera_in_use: 'कैमरा किसी अन्य ऐप द्वारा उपयोग में है',
    camera_not_ready: 'कैमरा तैयार नहीं है। थोड़ी देर प्रतीक्षा करें और फिर से प्रयास करें।',
    failed_to_load_model: 'कृत्रिम बुद्धिमत्ता शुरू करने में विफल',
    analysis_error: 'तस्वीर की जांच नहीं हो सकी। कृपया पुनः प्रयास करें।',
    
    // Results
    disease_name: 'रोग का नाम',
    severity: 'गंभीरता स्तर',
    affected_area: 'प्रभावित हिस्सा',
    treatment_steps: '💊 उपचार विधि',
    recommended_products: '🧪 सुझाई गई दवाएं',
    prevention_tips: '🛡️ बचाव के उपाय',
    
    // Severity levels
    severity_critical: 'बहुत गंभीर',
    severity_high: 'अधिक',
    severity_medium: 'मध्यम',
    severity_low: 'कम',
    severity_healthy: 'स्वस्थ है',
  },
  
  te: {
    // Common
    loading: 'నిరీక్షించండి',
    error: 'దోషం',
    offline_ready: '✈️ అంతర్జాలం అవసరం లేదు',
    
    // Crop Scan Tab
    crop_scanner: '📷 పంట పరీక్ష',
    take_photo_description: 'వ్యాధులను గుర్తించడానికి మీ పంట చిత్రం తీయండి',
    open_camera: '📸 కెమెరా తెరవండి',
    upload_photo: '🖼️ చిత్రం ఎక్కించండి',
    capture_photo: '📸 చిత్రం తీయండి',
    analyzing_crop: 'మీ పంటను పరిశీలిస్తోంది...',
    analyzing_description: 'మా కృత్రిమ మేధ వ్యాధులు మరియు ఆరోగ్య సూచనల కోసం చిత్రాన్ని పరీక్షిస్తోంది',
    scan_another_crop: '🔄 మరో పంట పరీక్షించండి',
    save_to_calendar: '💾 క్యాలెండర్‌లో భద్రపరచండి',
    saved_to_calendar: 'క్యాలెండర్‌లో భద్రపరచబడింది!',
    read_aloud: '🔊 బిగ్గరగా చదవండి',
    stop_reading: '⏸️ చదవడం ఆపండి',
    
    // Model Loading
    downloading_model: '⬇️ కృత్రిమ మేధ దింపుకుంటోంది...',
    loading_model: '🔄 కృత్రిమ మేధ సిద్ధమవుతోంది...',
    load_model: 'కృత్రిమ మేధ తెరవండి',
    
    // Errors
    camera_permission_denied: 'పంటలను పరీక్షించడానికి దయచేసి కెమెరా అనుమతి ఇవ్వండి',
    camera_not_found: 'ఈ పరికరంలో కెమెరా లేదు',
    camera_in_use: 'కెమెరా ఇప్పుడు వేరే అనువర్తనం ఉపయోగిస్తోంది',
    camera_not_ready: 'కెమెరా సిద్ధంగా లేదు. కొద్దిసేపు ఆగి మళ్లీ ప్రయత్నించండి.',
    failed_to_load_model: 'కృత్రిమ మేధ తెరవడంలో విఫలమైంది',
    analysis_error: 'చిత్రాన్ని విశ్లేషించలేకపోయింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
    
    // Results
    disease_name: 'వ్యాధి పేరు',
    severity: 'తీవ్రత స్థాయి',
    affected_area: 'ప్రభావిత భాగం',
    treatment_steps: '💊 చికిత్స పద్ధతులు',
    recommended_products: '🧪 సిఫార్సు చేసిన మందులు',
    prevention_tips: '🛡️ నివారణ చిట్కాలు',
    
    // Severity levels
    severity_critical: 'చాలా తీవ్రమైనది',
    severity_high: 'ఎక్కువ',
    severity_medium: 'మధ్యస్థం',
    severity_low: 'తక్కువ',
    severity_healthy: 'ఆరోగ్యంగా ఉంది',
  },
  
  ta: {
    // Common
    loading: 'ஏற்றுகிறது',
    error: 'பிழை',
    offline_ready: '✈️ இணையம் தேவையில்லை',
    
    // Crop Scan Tab
    crop_scanner: '📷 பயிர் பரிசோதனை',
    take_photo_description: 'நோய்களைக் கண்டறிய உங்கள் பயிரின் புகைப்படம் எடுக்கவும்',
    open_camera: '📸 கேமராவைத் திறக்கவும்',
    upload_photo: '🖼️ புகைப்படத்தை பதிவேற்றவும்',
    capture_photo: '📸 புகைப்படம் எடுக்கவும்',
    analyzing_crop: 'உங்கள் பயிரை பரிசோதிக்கிறது...',
    analyzing_description: 'எங்கள் செயற்கை நுண்ணறிவு நோய்கள் மற்றும் சுகாதார அறிகுறிகளை பரிசோதிக்கிறது',
    scan_another_crop: '🔄 மற்றொரு பயிரை பரிசோதிக்கவும்',
    save_to_calendar: '💾 நாட்காட்டியில் சேமிக்கவும்',
    saved_to_calendar: 'நாட்காட்டியில் சேமிக்கப்பட்டது!',
    read_aloud: '🔊 உரக்க படிக்கவும்',
    stop_reading: '⏸️ படிப்பதை நிறுத்தவும்',
    
    // Model Loading
    downloading_model: '⬇️ செயற்கை நுண்ணறிவு பதிவிறக்கம் செய்யப்படுகிறது...',
    loading_model: '🔄 செயற்கை நுண்ணறிவு தயாராகிறது...',
    load_model: 'செயற்கை நுண்ணறிவை தொடங்கவும்',
    
    // Errors
    camera_permission_denied: 'பயிர்களை பரிசோதிக்க கேமரா அனுமதி தேவை',
    camera_not_found: 'இந்த சாதனத்தில் கேமரா இல்லை',
    camera_in_use: 'கேமரா வேறு பயன்பாட்டால் பயன்படுத்தப்படுகிறது',
    camera_not_ready: 'கேமரா தயாராக இல்லை. சற்று காத்திருந்து மீண்டும் முயற்சிக்கவும்.',
    failed_to_load_model: 'செயற்கை நுண்ணறிவை தொடங்க முடியவில்லை',
    analysis_error: 'புகைப்படத்தை பரிசோதிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
    
    // Results
    disease_name: 'நோய் பெயர்',
    severity: 'தீவிர நிலை',
    affected_area: 'பாதிக்கப்பட்ட பகுதி',
    treatment_steps: '💊 சிகிச்சை முறைகள்',
    recommended_products: '🧪 பரிந்துரைக்கப்பட்ட மருந்துகள்',
    prevention_tips: '🛡️ தடுப்பு வழிமுறைகள்',
    
    // Severity levels
    severity_critical: 'மிகவும் தீவிரமானது',
    severity_high: 'அதிகம்',
    severity_medium: 'நடுத்தரம்',
    severity_low: 'குறைவு',
    severity_healthy: 'ஆரோக்கியமாக உள்ளது',
  },
};

export function getTranslation(lang: Language, key: keyof Translations): string {
  return translations[lang][key] || translations.en[key];
}
