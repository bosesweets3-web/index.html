
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, addDoc, updateDoc, serverTimestamp, runTransaction, writeBatch, query, orderBy, limit } from 'firebase/firestore';
import { 
  ShoppingBag, User, Menu, X, ArrowLeft, Gift, Clock, Truck, 
  ChevronRight, ChevronLeft, Plus, Minus, Phone, MapPin, Heart, 
  ShieldCheck, Award, MessageCircle, Sparkles, Trash2, ShoppingCart, Zap, Flame, CreditCard, Check, Info, Search, Instagram, Facebook, Filter, TrendingUp, Trophy, Flower, Crown, Layers, Shield, Edit, Trash, ArrowUp, ArrowDown, Grid, Home, Package,
  Loader2, ShieldAlert, Bell, ChevronDown, ChevronUp, HelpCircle, Eye, Settings, Image as ImageIcon, LayoutList, Copy, Layout, Star, StarHalf, MessageSquare, Quote
} from 'lucide-react';

// ========================================================
// SECTION 1: CONFIGURATION & FIREBASE SAFE INIT
// ========================================================
const firebaseConfig = typeof __firebase_config !== "undefined" && __firebase_config
  ? JSON.parse(__firebase_config)
  : {
      apiKey: "AIzaSyC7lFRp8BCess39puddzNOFJdQT5qxB-Os",
      authDomain: "bose-sweets.firebaseapp.com",
      projectId: "bose-sweets",
      storageBucket: "bose-sweets.firebasestorage.app",
      messagingSenderId: "549561862555",
      appId: "1:549561862555:web:03671bbaefefedf8f9f93e",
      measurementId: "G-65JK1GDV1T"
    };

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'boussy-sweets-enterprise';

const pink = { 
  bg: '#FFF9FA', light: '#FFF0F3', soft: '#FFDDE4', brand: '#FFB6C1', 
  vibrant: '#F06292', dark: '#D81B60', deep: '#AD1457', text: '#000000', accent: '#F06292' 
};

// ========================================================
// SECTION 2: ENTERPRISE ERROR BOUNDARY, UTILS & BACKOFF
// ========================================================

const retryOperation = async (operation, maxRetries = 5) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
};

// --- [تحديث محرك حلويات بوسي]: أداة تنظيف البيانات قبل الرفع السحابي لمنع انهيار الفايربيز ---
const cleanForFirestore = (obj) => {
    if (Array.isArray(obj)) return obj.map(cleanForFirestore).filter(v => v !== undefined);
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj)
                .map(([k, v]) => [k, cleanForFirestore(v)])
                .filter(([_, v]) => v !== undefined)
        );
    }
    return obj;
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("Critical System Error in حلويات بوسي:", error, errorInfo);
    try {
        const errorLogRef = collection(db, 'artifacts', appId, 'public', 'data', 'system_errors');
        addDoc(errorLogRef, {
            error: error.toString(),
            info: errorInfo.componentStack,
            timestamp: serverTimestamp()
        }).catch(()=>console.log("Could not log error"));
    } catch(e){}
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FFF9FA] p-4 text-center font-cairo" dir="rtl">
          <div className="bg-white p-10 rounded-[45px] shadow-2xl max-w-md border border-pink-100">
            <ShieldAlert size={60} className="text-pink-600 mx-auto mb-6 animate-pulse" />
            <h2 className="text-2xl font-black text-gray-800 mb-4">نظام حلويات بوسي للأمان</h2>
            <p className="text-gray-500 mb-8 font-bold">تم اكتشاف خطأ غير متوقع. النظام يقوم بحماية البيانات. يرجى إعادة تنشيط الجلسة.</p>
            <button onClick={() => window.location.reload()} className="w-full bg-pink-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl hover:bg-pink-700 transition-all">إعادة تنشيط النظام</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

const SafeHighlight = ({ text, highlight, color }) => {
  if (!text) return null;
  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) => 
        part.toLowerCase() === highlight.toLowerCase() 
          ? <span key={i} className="italic font-medium" style={{ color: color }}>{part}</span>
          : part
      )}
    </span>
  );
};

// ========================================================
// SECTION 3: ADVANCED SECURITY HELPERS (SALTED HASH)
// ========================================================
const hashPassword = async (password) => {
  const salt = `BOSSY_SECURE_${appId}_2026_ENTERPRISE_KEY`;
  const msgBuffer = new TextEncoder().encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// --- [تحديث محرك حلويات بوسي]: بصمة جهاز مزدوجة قوية لا تعتمد فقط على مساحة تخزين واحدة ---
const getDeviceID = () => {
  let deviceId = localStorage.getItem('bossy_secure_device_id') || sessionStorage.getItem('bossy_secure_device_fallback');
  if (!deviceId) {
    deviceId = crypto.randomUUID() + "_" + Date.now();
    localStorage.setItem('bossy_secure_device_id', deviceId);
    sessionStorage.setItem('bossy_secure_device_fallback', deviceId);
  } else if (!localStorage.getItem('bossy_secure_device_id')) {
    localStorage.setItem('bossy_secure_device_id', deviceId); // Healing
  } else if (!sessionStorage.getItem('bossy_secure_device_fallback')) {
    sessionStorage.setItem('bossy_secure_device_fallback', deviceId); // Healing
  }
  return deviceId;
};

// ========================================================
// SECTION 4: THE ENCYCLOPEDIA (FULL PDF DATA EXACT MATCH)
// ========================================================
const initialMenu = [
  {
    id: 'despacito', 
    name: 'الديسباسيتو', 
    category: 'ديسباسيتو', 
    img: 'https://picsum.photos/1200/800?random=ds1',
    shortDesc: 'تناغم قاعدة الكيك الفادج الغني بطبقة كثيفة من النوتيلا والموس المحضر بمعايير خاصة.',
    desc: 'يتميز المنتج بتناغم قاعدة من الكيك الفادج الغني بطبقة كثيفة من النوتيلا والموس الشوكولاتة المحضر بمعايير خاصة. تتوفر خيارات متعددة للأحجام لتناسب كافة متطلبات التقديم والضيافة وفقاً لأعلى مستويات الجودة. القوام المتماسك مع سلاسة الموس لضمان تجربة تذوق احترافية وعميقة النكهة.',
    healthSection: 'نعتمد استخدام بودرة الكاكاو الخام الطبيعية مع موازنة دقيقة لنسب السكر لتعزيز النكهة الأصلية. كافة المكونات طبيعية بالكامل وتخضع لرقابة صارمة لضمان خلوها من أي إضافات صناعية، لتقديم منتج يجمع بين القيمة الغذائية والمذاق القوي بما يتماشى مع معايير حلويات بوسي الصحية.',
    features: ['كيك فادج غني', 'موس شوكولاتة كثيف', 'نوتيلا أصلية', 'كاكاو خام طبيعي'],
    options: [
      { 
        label: 'المثلث', 
        flavors: [
          { name: 'النوتيلا الدارك', price: 60 }, { name: 'النوتيلا الوايت', price: 60 }, { name: 'اللوتس', price: 60 }, 
          { name: 'الكراميل', price: 60 }, { name: 'الكيندر', price: 60 }, { name: 'البلوبيري', price: 60 }, 
          { name: 'الراسبيري', price: 60 }, { name: 'الكرز', price: 60 }, { name: 'الاسنيكرز', price: 60 }, 
          { name: 'الميكس شوكليت', price: 60 }, { name: 'البيستاشيو', price: 75 }
        ]
      },
      { 
        label: 'الوسط', 
        flavors: [
          { name: 'النوتيلا الدارك', price: 120 }, { name: 'النوتيلا الوايت', price: 120 }, { name: 'اللوتس', price: 120 }, 
          { name: 'الكراميل', price: 120 }, { name: 'الكيندر', price: 120 }, { name: 'البلوبيري', price: 120 }, 
          { name: 'الراسبيري', price: 120 }, { name: 'الكرز', price: 120 }, { name: 'الاسنيكرز', price: 120 }, 
          { name: 'الميكس شوكليت', price: 120 }, { name: 'البيستاشيو', price: 150 }
        ]
      },
      { 
        label: 'الكبير', 
        flavors: [
          { name: 'النوتيلا الدارك', price: 240 }, { name: 'النوتيلا الوايت', price: 240 }, { name: 'اللوتس', price: 240 }, 
          { name: 'الكراميل', price: 240 }, { name: 'الكيندر', price: 240 }, { name: 'البلوبيري', price: 240 }, 
          { name: 'الراسبيري', price: 240 }, { name: 'الكرز', price: 240 }, { name: 'الاسنيكرز', price: 240 }, 
          { name: 'الميكس شوكليت', price: 240 }, { name: 'البيستاشيو', price: 270 }
        ]
      }
    ]
  },
  {
    id: 'tortes-royal', 
    name: 'التورت', 
    category: 'تورت', 
    img: 'https://picsum.photos/1200/800?random=t1',
    shortDesc: 'عالم من التنوع يرتكز على الفئة الملكية الفاخرة بالخامات العالمية وتصاميم الـ 3D.',
    desc: 'نقدم عالماً من التنوع يرتكز على الفئة الملكية الفاخرة بالخامات العالمية وتصاميم الـ 3D الهندسية. يتم تصميم وتنفيذ التورت خصيصاً لتناسب عدد الأفراد المطلوب بلمسات فنية تعكس احترافية حلويات بوسي. نعتمد أعلى معايير الدقة في التنفيذ لضمان تقديم منتج استثنائي يمثل الواجهة المشرفة لكافة مناسباتكم.',
    flavors: [
      { name: 'التورتة الملكية', price: 'حسب الطلب' }
    ]
  },
  {
    id: 'mini-tortes', 
    name: 'الميني تورتة', 
    category: 'تورت', 
    img: 'https://picsum.photos/1200/800?random=mt1',
    shortDesc: 'تورتات صغيرة الحجم تتميز بتتفاصيل فنية دقيقة تنفذ يدوياً.',
    desc: 'تورتات صغيرة الحجم تتميز بتفاصيل فنية دقيقة تنفذ يدوياً وفقاً للتصميم المطلوب لمناسباتكم الخاصة. نوفر ثلاثة أحجام مدروسة بعناية لتناسب التجمعات المحدودة التي تتطلب لمسة احترافية من حلويات بوسي.',
    flavors: [
      { name: 'الفردين', price: 140 }, 
      { name: 'الأربعة أفراد', price: 280 }, 
      { name: 'الستة أفراد', price: 420 }
    ]
  },
  {
    id: 'gateaux', 
    name: 'الجاتوه', 
    category: 'جاتوه', 
    img: 'https://picsum.photos/1200/800?random=g1',
    shortDesc: 'تشكيلة احترافية من الجاتوه، تشتمل الدستة على 12 قطعة بجودة فنية.',
    desc: 'تشكيلة احترافية من الجاتوه، حيث تشتمل الدستة من أي فئة مختارة على اثنتي عشرة قطعة. تتنوع الفئات لتلبي كافة متطلبات الضيافة الرسمية والخاصة بلمسات فنية تعكس احترافية حلويات بوسي.',
    flavors: [
      { name: 'الملكي (12 قطعة)', price: 580 }, 
      { name: 'الكلاسيك (12 قطعة)', price: 460 }, 
      { name: 'السواريه (12 قطعة)', price: 1340 }
    ]
  },
  {
    id: 'qashtoota', 
    name: 'القشطوطة', 
    category: 'قشطوطة', 
    img: 'https://picsum.photos/1200/800?random=q1',
    shortDesc: 'كيك فانيليا هش مشبع بالحليب الطبيعي النقي والمغطى بكريمة بوسي الخاصة.',
    desc: 'الكيك الفانيليا الهش المشبع بالحليب الطبيعي النقي والمغطى بطبقة من كريمة حلويات بوسي الخاصة. يتم تدعيم المنتج بالمكسرات الفاخرة والفواكه الطازجة لتقديم توازن مثالي في القوام والنكهة.',
    flavors: [
      { name: 'النوتيلا الدارك', price: 110 }, { name: 'النوتيلا الوايت', price: 110 }, 
      { name: 'اللوتس', price: 110 }, { name: 'البيستاشيو', price: 130 }, 
      { name: 'الكيندر', price: 110 }, { name: 'الكراميل', price: 110 }, 
      { name: 'المانجا', price: 110 }, { name: 'الفراولة', price: 110 }, 
      { name: 'الموز', price: 110 }, { name: 'الميكس نكهات', price: 110 }
    ]
  },
  {
    id: 'donuts', 
    name: 'الدوناتس', 
    category: 'دوناتس', 
    img: 'https://picsum.photos/1200/800?random=d1',
    shortDesc: 'حلقات العجين الهشة المخبوزة يومياً بصوصات عالمية بتنسيق متقن.',
    desc: 'الحلقات العجين الهشة المخبوزة يومياً لضمان أعلى مستويات النعومة والجودة في المذاق. نعتمد تغطية خارجية من أجود أنواع الصوصات العالمية بتنسيق احترافي ومتقن.',
    flavors: [
      { name: 'النوتيلا الدارك', price: 80 }, { name: 'النوتيلا الوايت', price: 80 }, 
      { name: 'البلوبيري والراسبيري', price: 90 }, { name: 'الريد فيلفت', price: 90 }, 
      { name: 'اللوتس', price: 80 }, { name: 'البيستاشيو', price: 100 }, 
      { name: 'الكيندر', price: 80 }, { name: 'الكراميل', price: 80 }, 
      { name: 'الفراولة', price: 80 }, { name: 'المانجا', price: 90 }, 
      { name: 'الماتيلدا', price: 100 }, { name: 'الاوريو', price: 80 }, 
      { name: 'الكرز', price: 80 }
    ]
  },
  {
    id: 'bambolini', 
    name: 'البامبوليني', 
    category: 'بامبوليني', 
    img: 'https://picsum.photos/1200/800?random=b1',
    shortDesc: 'قطع دائرية من العجين الهش محشوة غنياً بأجود أنواع الكريمات.',
    desc: 'قطع دائرية من العجين الهش محشوة غنياً من الداخل بأجود أنواع الكريمات والصوصات. نعتمد في حلويات بوسي معايير دقيقة لضمان توازن الحشو مع هشاشة العجين الخارجية.',
    flavors: [
      { name: 'النوتيلا الدارك', price: 80 }, { name: 'النوتيلا الوايت', price: 80 }, 
      { name: 'اللوتس', price: 80 }, { name: 'البيستاشيو', price: 100 }, 
      { name: 'الكيندر', price: 80 }, { name: 'الكراميل', price: 80 }, 
      { name: 'البلوبيري والراسبيري', price: 90 }, { name: 'الريد فيلفت', price: 90 }, 
      { name: 'الفراولة', price: 80 }, { name: 'المانجا', price: 90 }, 
      { name: 'الماتيلدا', price: 90 }, { name: 'الاوريو', price: 80 }, 
      { name: 'الكرز', price: 80 }
    ]
  },
  {
    id: 'cinnabon', 
    name: 'السينابون', 
    category: 'سينابون', 
    img: 'https://picsum.photos/1200/800?random=c1',
    shortDesc: 'عجينة قطنية بالزبدة الفاخرة والقرفة الممتازة مخبوزة طازجة.',
    desc: 'العجينة القطنية المحضرة بالزبدة الفاخرة والقرفة الممتازة المخبوزة طازجة في حلويات بوسي. مغطى بالصوص التشيز الكثيف والتوبينج المختار لتقديم مذاق يتميز بالرقي والعمق.',
    flavors: [
      { name: 'النوتيلا الوايت', price: 110 }, { name: 'النوتيلا الدارك', price: 110 }, 
      { name: 'البلوبيري', price: 110 }, { name: 'الراسبيري', price: 110 }, 
      { name: 'الرفايلو', price: 110 }, { name: 'الاوريو', price: 110 }, 
      { name: 'اللوتس', price: 110 }, { name: 'البيستاشيو', price: 130 }, 
      { name: 'الكيندر', price: 110 }, { name: 'الكراميل', price: 110 }, 
      { name: 'الكلاسيك', price: 110 }
    ]
  },
  {
    id: 'box-rowaqan', 
    name: 'البوكس الروقان', 
    category: 'بوكسات', 
    img: 'https://picsum.photos/1200/800?random=br1',
    shortDesc: 'إصدار خاص يجمع تشكيلة متنوعة من منتجات حلويات بوسي المميزة.',
    desc: 'إصدار خاص يجمع تشكيلة متنوعة من منتجات حلويات بوسي المميزة في عبوة واحدة. يحتوي على التورتة المختارة مع الكبات السعادة والديسباسيتو والريد فيلفت لتلبية كافة الأذواق.',
    flavors: [
      { name: 'المتكامل', price: 500 }
    ]
  },
  {
    id: 'red-velvet', 
    name: 'الريد فيلفت', 
    category: 'ريد فيلفت', 
    img: 'https://picsum.photos/1200/800?random=rv1',
    shortDesc: 'طبقات الكيك المخملي الفاخر بلونه الأحمر وكريمة الجبن الغنية.',
    desc: 'طبقات الكيك المخملي الفاخر بلونه الأحمر وكريمة الجبن الغنية والمحضرة ببراعة تامة. توازن مثالي بين القوام الكريمي والمذاق الرائع الذي يذوب في الفم من إنتاج حلويات بوسي.',
    flavors: [
      { name: 'المثلث الكبير', price: 65 }, 
      { name: 'الكب الوسط', price: 90 }, 
      { name: 'الطاجن الكبير', price: 150 }
    ]
  },
  {
    id: 'happiness-cups', 
    name: 'الكبات السعادة', 
    category: 'كبات', 
    img: 'https://picsum.photos/1200/800?random=h1',
    shortDesc: 'مزيج من طبقات الكيك والموس والكريمات في كبات تعطيك جرعة مركزة من الجودة.',
    desc: 'مزيج من طبقات الكيك والموس والكريمات في كبات تعطيك جرعة مركزة من الجودة. متوفرة بـ 11 نكهة عالمية لترضي كافة الأذواق وتقدم لك تجربة فريدة من حلويات بوسي.',
    flavors: [
      { name: 'النوتيلا', price: 55 }, { name: 'اللوتس', price: 55 }, 
      { name: 'الأوريو', price: 55 }, { name: 'الاسنيكرز', price: 55 }, 
      { name: 'البلوبيري', price: 55 }, { name: 'الراسبيري', price: 55 }, 
      { name: 'الكرز', price: 55 }, { name: 'الكيت كات', price: 55 }, 
      { name: 'الفيلو', price: 55 }, { name: 'الكيندر', price: 55 }
    ]
  },
  {
    id: 'roses', 
    name: 'الورد', 
    category: 'ورد', 
    img: 'https://picsum.photos/1200/800?random=roses1',
    shortDesc: 'باقات الزهور المختارة بعناية فائقة لتكون المكمل المثالي لهدايا حلويات بوسي.',
    desc: 'الباقات الزهور المختارة بعناية فائقة لتكون المكمل المثالي لهدايا حلويات بوسي الراقية. متوفر خيارات متنوعة تشمل الورد الطبيعي، الصناعي، والستان المشغول يدوياً باحترافية.',
    flavors: [
      { name: 'الطبيعي والصناعي', price: 'حسب الطلب' }, 
      { name: 'الستان', price: 'حسب الطلب' }
    ]
  }
];

const initialCategories = [
  { name: "التورت الملكية", id: 'tortes-royal', img: "https://picsum.photos/400/500?random=11" },
  { name: "الديسباسيتو", id: 'despacito', img: "https://picsum.photos/400/500?random=12" },
  { name: "الميني تورتة", id: 'mini-tortes', img: "https://picsum.photos/400/500?random=13" },
  { name: "السينابون", id: 'cinnabon', img: "https://picsum.photos/400/500?random=14" },
  { name: "الورد", id: 'roses', img: "https://picsum.photos/400/500?random=15" }
];

const initialSections = [
    { id: 'sec_hero', type: 'waterfall', isVisible: true, title: 'الشلال الرئيسي', heading: 'عقد من التميز', desc: 'نبتكر السعادة ونقدمها لكم بكل حب وإتقان منذ عام 2014 في معاملنا المتخصصة - حلويات بوسي.', images: ["https://picsum.photos/400/500?random=101", "https://picsum.photos/400/500?random=102", "https://picsum.photos/400/500?random=103", "https://picsum.photos/400/500?random=104", "https://picsum.photos/400/500?random=105", "https://picsum.photos/400/500?random=106", "https://picsum.photos/400/500?random=107", "https://picsum.photos/400/500?random=108"] },
    { id: 'sec_arrivals', type: 'products_slider', isVisible: true, title: 'وصل حديثاً', heading: 'وصل حديثاً', desc: 'استكشف أحدث ابتكارات معاملنا الفاخرة، حيث تجتمع الدقة الفنية مع النكهات الحصرية لتمنحك تجربة تذوق فريدة من حلويات بوسي.', selectedProducts: ['bambolini', 'red-velvet', 'happiness-cups', 'cinnabon', 'mini-tortes'] },
    { id: 'sec_categories', type: 'categories', isVisible: true, title: 'تسوق حسب الفئة', heading: 'تسوق حسب الفئة', desc: 'اختر من بين مجموعاتنا الفاخرة ما يناسب ذوقك الرفيع. كل قسم صُمم خصيصاً لتصنع لحظات لا تُنسى.' },
    { id: 'sec_products', type: 'products_grid', isVisible: true, title: 'شبكة المنتجات', heading: 'المنتجات', desc: '', selectedProducts: ['despacito', 'tortes-royal', 'mini-tortes', 'qashtoota', 'donuts', 'bambolini', 'gateaux', 'cinnabon'] },
    { id: 'sec_giftcards', type: 'banner', isVisible: true, title: 'البطاقات والهدايا', heading: 'بطاقات الهدايا الملكية', desc: 'امنح من تحب حرية الاختيار من قائمة حلويات بوسي الفاخرة. بطاقات هدايا برصيد متجدد وقيمة لا تُنسى تليق بمن تحب.' },
    { id: 'sec_legacy', type: 'slider', isVisible: true, title: 'عقد من الإتقان (الإرث)', heading: 'إرث منذ 2014', desc: 'في حلويات بوسي، نعتمد على أفضل المكونات الطبيعية لنقدم لكم جودة تليق بذائقتكم الرفيعة يدوياً وبكل حب.', images: ["https://picsum.photos/600/800?random=101", "https://picsum.photos/600/800?random=102", "https://picsum.photos/600/800?random=103"] },
    { id: 'sec_stats', type: 'text_cards', isVisible: true, title: 'الاعتزاز والفخر', heading: 'الفخر والاعتزاز', desc: 'بثقة تتجاوز الـ 5000 عميل، تظل حلويات بوسي هي الوجهة الأولى لمن يبحث عن الجودة المطلقة في الفرافرة والكفاح.' },
    { id: 'sec_bestsellers', type: 'products_slider', isVisible: true, title: 'الأكثر مبيعاً', heading: 'الأكثر مبيعاً', desc: 'انضم لآلاف المتذوقين الذين اختاروا هذه الروائع كأفضل ما قدمته معامل حلويات بوسي. أصناف حققت أعلى تقييمات.', selectedProducts: ['box-rowaqan', 'qashtoota', 'despacito', 'gateaux'] },
    { id: 'sec_roses', type: 'banner', isVisible: true, title: 'الورد الطبيعي', heading: 'سحر الطبيعة بين يديك', desc: 'ننفرد في حلويات بوسي بكوننا العلامة الوحيدة التي تقدم لكم الورد الطبيعي الطازج بجانب أرقى الحلويات.' }
];

const initialGlobalSettings = { 
    siteTitle: 'حلويات بوسي', 
    phone: '01097238441', 
    address: 'الفرافرة',
    marqueeText: ['اربح 10 نقاط مكافأة لكل 100 جنيه تنفقها معنا', 'جودة تليق بكم', 'نخدم الكفاح والفرافرة', 'حلويات بوسي: طعم الفخامة الأصيل', 'عقد من التميز'],
    footerAbout: 'نحن في حلويات بوسي نصنع السعادة منذ 2014. نلتزم بأعلى معايير الجودة العالمية لنقدم لكم تجربة لا تُنسى في معاملنا الرسمية في الفرافرة والكفاح.',
    sidebarPromoTitle: 'أهلاً بك في حلويات بوسي',
    sidebarPromoSub: 'استمتع بتجربة تسوق لا تُنسى',
    storeHours: 'نعمل يومياً من 10 ص إلى 12 م',
    shippingCost: 0,
    facebook: '',
    instagram: ''
};

const superstarCandidates = [ 'box-rowaqan', 'qashtoota', 'despacito', 'gateaux' ];
const newArrivalsPool = [ 'bambolini', 'red-velvet', 'happiness-cups', 'cinnabon', 'mini-tortes', 'gateaux' ];
const legacyImages = ["https://picsum.photos/600/800?random=101", "https://picsum.photos/600/800?random=102", "https://picsum.photos/600/800?random=103"];

// ========================================================
// SECTION 5: DEDICATED GIFT CARDS INTERNAL PAGE (FULL DETAILS)
// ========================================================
const GiftCardsPage = React.memo(({ onBack, onAddToCart, pink, siteTitle }) => {
  const [activeTierIdx, setActiveTierIdx] = useState(1); 
  const [customValue, setCustomValue] = useState('');
  
  const presetTiers = [
    { id: 'gc_200', value: 200, name: 'البطاقة البرونزية', bg: 'from-[#E3A869] via-[#CD7F32] to-[#8B5A2B]', textColor: 'text-white', ring: 'ring-[#CD7F32]' },
    { id: 'gc_500', value: 500, name: 'البطاقة الفضية', bg: 'from-gray-100 via-gray-50 to-gray-200', textColor: 'text-gray-600', ring: 'ring-gray-300' },
    { id: 'gc_1000', value: 1000, name: 'البطاقة الذهبية', bg: 'from-yellow-200 via-yellow-400 to-amber-500', textColor: 'text-yellow-900', ring: 'ring-yellow-400' },
    { id: 'gc_2500', value: 2500, name: 'البطاقة البلاتينية', bg: 'from-[#F06292] via-[#E91E63] to-[#AD1457]', textColor: 'text-white', ring: 'ring-pink-400' }
  ];

  const customTier = {
      id: 'gc_custom',
      value: parseInt(customValue) >= 200 ? parseInt(customValue) : 200,
      name: 'الملكية الماسية',
      bg: 'from-white via-[#FFF0F3] to-[#FFDDE4]',
      textColor: 'text-[#AD1457]',
      ring: 'ring-[#F06292]',
      border: 'border-2 border-white shadow-[0_0_30px_rgba(216,27,96,0.15)]'
  };

  const activeTier = activeTierIdx === -1 ? customTier : presetTiers[activeTierIdx];

  const handleCustomValueChange = (e) => {
      setCustomValue(e.target.value);
      setActiveTierIdx(-1);
  };

  const handlePurchase = () => {
      const finalValue = activeTierIdx === -1 
          ? (parseInt(customValue) >= 200 ? parseInt(customValue) : 200) 
          : activeTier.value;

      onAddToCart(
          { id: activeTier.id, name: `بطاقة هدايا حلويات بوسي`, img: 'https://picsum.photos/400/300?random=gift', price: finalValue },
          { name: activeTier.name, price: finalValue },
          'إهداء فاخر ومميز'
      );
  };

  const faqs = [
      { q: "ما هي فكرة بطاقة هدايا حلويات بوسي؟", a: "هي بطاقة إهداء ملكية مسبقة الدفع، تمنح أحباءك حرية اختيار ما يفضلونه من قائمة حلويات بوسي الفاخرة، لتكون هديتك مضمونة النجاح وتناسب ذوقهم الخاص." },
      { q: "هل الرصيد متجدد أم يجب استخدامه في طلب واحد؟", a: "رصيد البطاقة متجدد بالكامل! يمكن للمهدى إليه استخدام جزء من الرصيد في طلب، والاحتفاظ بالمتبقي لطلبات مستقبلية، مما يضمن له الاستمتاع المستمر." },
      { q: "ما هي أقل قيمة يمكنني إهداؤها؟", a: "تبدأ قيم بطاقات الهدايا من 200 ج.م كحد أدنى، وتصل لأي مبلغ تراه مناسباً من خلال إدخال 'القيمة المخصصة' التي تعبر عن كرمك وتقديرك لمن تحب." },
      { q: "كيف يتم تسليم البطاقة للمهدى إليه؟", a: "نوفر لك خيارين: بطاقة رقمية فاخرة يتم إرسالها فوراً عبر الواتساب كرسالة مفاجئة، أو بطاقة مطبوعة بتغليف ملكي خاص من حلويات بوسي يتم توصيلها يداً بيد." }
  ];

  const FAQItem = ({ q, a }) => {
      const [isOpen, setIsOpen] = useState(false);
      return (
          <div className="border-b border-pink-50 last:border-0 py-5">
              <button onClick={() => setIsOpen(!isOpen)} className="flex justify-between items-center w-full text-right font-black text-gray-800 hover:text-pink-600 transition-colors">
                  <span className="text-[15px] md:text-[16px] pl-4 leading-relaxed">{q}</span>
                  <div className={`p-2 rounded-full transition-colors ${isOpen ? 'bg-pink-100 text-pink-600' : 'bg-gray-50 text-gray-400'}`}>
                      {isOpen ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                  </div>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <p className="text-sm md:text-[15px] text-gray-500 font-bold leading-relaxed border-r-4 border-pink-300 pr-4">{a}</p>
              </div>
          </div>
      )
  };

  return (
    <div className="min-h-screen bg-[#FFF9FA] pt-10 pb-24 px-4 sm:px-6 relative animate-fadeIn">
      <div className="absolute top-0 right-0 w-full h-96 bg-gradient-to-b from-pink-100/50 to-transparent pointer-events-none"></div>

      <div className="max-w-6xl mx-auto mb-10 relative z-10 flex justify-end">
          <button onClick={onBack} className="font-bold flex items-center gap-2 text-lg text-gray-500 hover:text-pink-600 transition-all bg-white px-6 py-3 rounded-full shadow-sm border border-pink-50 hover:shadow-md">
              العودة للرئيسية <ArrowLeft size={24} />
          </button>
      </div>

      <div className="max-w-4xl mx-auto text-center mb-16 relative z-10">
        <div className="inline-flex items-center justify-center gap-3 mb-6">
            <div className="bg-gradient-to-r from-pink-500 to-pink-600 text-white p-3 rounded-2xl shadow-lg shadow-pink-500/30"><Crown size={28} /></div>
            <span className="text-[14px] font-black tracking-[0.4em] uppercase text-pink-500">Premium Gifting</span>
        </div>
        <h1 className="text-[44px] md:text-[64px] font-black tracking-tighter leading-tight mb-6 text-gray-900">
            بطاقات هدايا <span className="text-pink-600">حلويات بوسي</span>
        </h1>
        <p className="text-gray-500 text-[16px] md:text-[20px] font-bold leading-relaxed max-w-3xl mx-auto">
            لأن من تحبهم يستحقون الأفضل، امنحهم حرية الاختيار من تشكيلتنا الملكية عبر بطاقات هدايا فاخرة برصيد متجدد وقيمة لا تُنسى.
        </p>
      </div>

      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-12 lg:gap-16 items-start relative z-10">
        <div className="flex-1 text-right w-full lg:order-2">
            <div className="bg-white p-8 md:p-10 rounded-[40px] shadow-[0_15px_50px_rgba(216,27,96,0.08)] border border-pink-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-pink-50/50 rounded-bl-full -z-10"></div>
                <h4 className="text-2xl font-black text-gray-900 mb-8 flex items-center justify-end gap-3">
                    حدد قيمة الهدية <CreditCard className="text-pink-500" />
                </h4>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                    {presetTiers.map((tier, idx) => (
                        <button
                            key={tier.id}
                            onClick={() => { setActiveTierIdx(idx); setCustomValue(''); }}
                            className={`p-5 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center justify-center gap-2 group ${activeTierIdx === idx ? `border-transparent shadow-xl ring-4 ${tier.ring} ring-offset-4 transform scale-[1.03] bg-gradient-to-br ${tier.bg} ${tier.textColor}` : 'border-gray-100 bg-gray-50 hover:border-pink-300 hover:bg-pink-50 hover:shadow-md'}`}
                        >
                            <span className={`text-2xl font-black ${activeTierIdx === idx ? '' : 'text-gray-800 group-hover:text-pink-600'}`}>{tier.value} ج.م</span>
                            <span className={`text-[12px] font-bold uppercase tracking-wider ${activeTierIdx === idx ? 'opacity-90' : 'text-gray-400'}`}>{tier.name}</span>
                        </button>
                    ))}
                </div>

                <div className="relative mb-8 bg-[#FFF9FA] p-6 rounded-3xl border border-pink-100">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[12px] font-bold text-pink-600 bg-pink-100 px-3 py-1 rounded-lg">يبدأ من 200 ج.م</span>
                        <label className="text-[15px] font-black text-gray-700">بطاقة بقيمة مخصصة</label>
                    </div>
                    <div className={`flex items-center bg-white border-2 rounded-2xl overflow-hidden transition-all shadow-inner ${activeTierIdx === -1 ? 'border-pink-400 ring-4 ring-pink-100' : 'border-pink-100 focus-within:border-pink-400'}`}>
                        <span className="px-6 font-black text-gray-500 bg-gray-100 border-l border-gray-200 h-full flex items-center text-lg">ج.م</span>
                        <input 
                            type="number" 
                            min="200"
                            placeholder="أدخل المبلغ المراد إهداؤه..."
                            value={customValue}
                            onChange={handleCustomValueChange}
                            className="w-full p-5 text-left font-black text-2xl text-[#AD1457] bg-transparent outline-none placeholder:text-pink-200 placeholder:font-bold placeholder:text-lg"
                            dir="ltr"
                        />
                    </div>
                </div>

                <button
                    onClick={handlePurchase}
                    className="w-full bg-gradient-to-r from-pink-600 to-pink-500 text-white py-5 rounded-2xl font-black text-xl shadow-xl shadow-pink-500/40 hover:shadow-pink-500/60 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 group border border-pink-400"
                >
                    تأكيد شراء البطاقة <Gift size={24} className="group-hover:-translate-y-1 group-hover:scale-110 transition-all" />
                </button>
            </div>
        </div>

        <div className="flex-1 w-full flex flex-col lg:order-1 gap-12">
            <div className="card-3d-wrapper py-4 flex justify-center w-full perspective-[1200px]">
                <div className={`card-3d relative w-full max-w-md aspect-[1.6/1] rounded-[35px] md:rounded-[40px] p-8 md:p-10 shadow-[0_30px_60px_rgba(216,27,96,0.25)] flex flex-col justify-between overflow-hidden bg-gradient-to-br ${activeTier.bg} ${activeTier.border || ''}`}>
                    <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
                    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent skew-x-[-30deg] animate-[shimmer_3s_infinite] pointer-events-none"></div>

                    <div className="relative z-20 flex justify-between items-start text-right">
                        <div className={activeTier.textColor}>
                            <h4 className="text-3xl md:text-4xl font-black tracking-tighter mb-1 drop-shadow-md" style={{ textShadow: '0 2px 10px rgba(255,255,255,0.3)' }}>{siteTitle}</h4>
                            <p className="text-[10px] md:text-xs font-black tracking-[0.5em] uppercase opacity-90 drop-shadow-sm">{activeTier.name}</p>
                        </div>
                        <Crown size={50} className={`${activeTier.textColor} opacity-90 drop-shadow-md`} />
                    </div>

                    <div className="relative z-20 flex items-end justify-between mt-auto">
                        <div className="flex gap-2 opacity-90">
                             <div className={`w-14 h-10 rounded-lg border-2 border-current bg-white/20 backdrop-blur-md flex items-center justify-center ${activeTier.textColor} shadow-inner`}><span className="w-8 h-5 bg-current opacity-40 rounded-[3px]"></span></div>
                        </div>
                        <div className={`text-center ${activeTier.textColor}`}>
                            <span className="text-[12px] font-black opacity-90 uppercase tracking-widest block mb-1 drop-shadow-sm">Gift Balance</span>
                            <div className="flex justify-center items-baseline gap-2 drop-shadow-xl" style={{ textShadow: '0 4px 15px rgba(255,255,255,0.4)' }}>
                                <span className="text-6xl md:text-7xl font-black tracking-tighter leading-none">{activeTierIdx === -1 && !customValue ? '200' : activeTier.value}</span>
                                <span className="text-2xl font-bold opacity-90">EGP</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-[0_15px_50px_rgba(216,27,96,0.06)] border border-pink-100 p-8 md:p-10 text-right relative overflow-hidden">
                <div className="absolute -bottom-10 -left-10 opacity-5 text-pink-400"><HelpCircle size={200} /></div>
                <div className="flex items-center justify-end gap-3 mb-8 border-b border-pink-100 pb-6 relative z-10">
                    <h4 className="text-2xl font-black text-gray-900 tracking-tight">كيف تعمل بطاقات بوسي؟</h4>
                    <div className="bg-gray-100 text-gray-600 p-2.5 rounded-xl"><Info size={24} /></div>
                </div>
                <div className="flex flex-col relative z-10">
                    {faqs.map((faq, idx) => (
                        <FAQItem key={idx} q={faq.q} a={faq.a} />
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
});

// ========================================================
// SECTION 6: SHARED UI COMPONENTS & QUICK VIEW MODAL
// ========================================================
const ProductCard = React.memo(({ p, onNavigate, onQuickView }) => (
  <div className="bg-white rounded-[30px] border border-gray-100 overflow-hidden text-right group shadow-sm transition transform active:scale-95 cursor-pointer flex flex-col h-full hover:shadow-xl hover:border-pink-200">
    <div className="h-[210px] w-full overflow-hidden bg-gray-50 relative">
      <img loading="lazy" src={p.img} alt={p.name} onClick={() => onNavigate('product-detail', p)} className="w-full h-full object-cover transition transform group-hover:scale-105 duration-700" />
      <div className="absolute top-3 left-3 flex flex-col gap-2">
        <div className="bg-white/80 p-1.5 rounded-full shadow-sm hover:bg-white hover:text-pink-600 transition-colors"><Heart size={14} className="text-pink-500" /></div>
        <button onClick={(e) => { e.stopPropagation(); onQuickView(p); }} className="bg-white/80 p-1.5 rounded-full shadow-sm hover:bg-pink-600 hover:text-white transition-all transform opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0" title="نظرة سريعة لمنتجات حلويات بوسي">
            <Eye size={14} />
        </button>
      </div>
    </div>
    <div className="p-5 flex flex-col flex-grow bg-white text-right" onClick={() => onNavigate('product-detail', p)}>
      <h4 className="text-[14px] font-bold text-black mb-1 leading-snug group-hover:text-pink-600 transition-colors">{p.name}</h4>
      <p className="text-[10px] text-gray-500 font-light leading-4 mb-4 line-clamp-2">{p.shortDesc || p.desc}</p>
      <div className="flex justify-between items-center mt-auto pt-2">
        <span className="text-[14px] font-black" style={{ color: pink.vibrant }}>استعراض</span>
        <button className="text-[11px] font-bold flex items-center gap-1 bg-pink-50 text-pink-600 px-2 py-1 rounded-lg group-hover:bg-pink-600 group-hover:text-white transition-colors">التفاصيل <ChevronRight size={12} /></button>
      </div>
    </div>
  </div>
));

// ========================================================
// SECTION 7: MAIN APPLICATION SYSTEM (PUBLIC + ADMIN)
// ========================================================

const App = () => {
  // 🌟 REAL CLOUD DATA ENGINE 🌟
  const [appProducts, setAppProducts] = useState(initialMenu);
  const [appCategories, setAppCategories] = useState(initialCategories);
  const [appSections, setAppSections] = useState(initialSections);
  const [settings, setSettings] = useState(initialGlobalSettings);
  const [secureHash, setSecureHash] = useState('QWFkbWlu'); 

  // --- A. PUBLIC STATES ---
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('home');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cart, setCart] = useState([]); 
  const [reviews, setReviews] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [activeSizeIndex, setActiveSizeIndex] = useState(0);
  const [filterCategory, setFilterCategory] = useState('الكل');
  const [appLoading, setAppLoading] = useState(true);
  const [legacyIndex, setLegacyIndex] = useState(0);
  const [newReview, setNewReview] = useState({ text: '', reviewerName: '', rating: 5 });
  const [toast, setToast] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // --- [تحديث محرك حلويات بوسي]: حفظ تلقائي لبيانات التوصيل في المتصفح ---
  const [checkoutData, setCheckoutData] = useState(() => {
      try {
          const saved = localStorage.getItem('bossy_secure_checkout_data');
          return saved ? JSON.parse(saved) : { name: '', address: '', phone: '' };
      } catch(e) {
          return { name: '', address: '', phone: '' };
      }
  });
  
  const [isScrolled, setIsScrolled] = useState(false); 
  const [showScrollTop, setShowScrollTop] = useState(false);
  const timeoutRef = useRef(null);

  // --- B. ADMIN DASHBOARD STATES ---
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPinInput, setAdminPinInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [adminLoginAttempts, setAdminLoginAttempts] = useState(0);
  const [isAdminLocked, setIsAdminLocked] = useState(false);
  const [adminLockTimer, setAdminLockTimer] = useState(0);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState('dashboard');
  const [adminModalConfig, setAdminModalConfig] = useState({ isOpen: false, type: '', mode: 'add', data: null });
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [debouncedAdminSearch, setDebouncedAdminSearch] = useState(''); // Added debouncer state
  const [isAdminMobileMenuOpen, setIsAdminMobileMenuOpen] = useState(false);
  const [libraryImages, setLibraryImages] = useState([]);
  const [orderFilter, setOrderFilter] = useState('all');
  const [realOrders, setRealOrders] = useState([]);
  
  const [dashOrders, setDashOrders] = useState([
    { id: '#1055', customer: 'خالد عبد الله', phone: '01011223344', items: [{name: 'الديسباسيتو', qty: 1, price: 120}], total: 120, status: 'pending', date: 'منذ 10 دقائق', source: 'demo' },
    { id: '#1054', customer: 'سارة جمال', phone: '01012345678', items: [{name: 'القشطوطة', qty: 2, price: 220}], total: 220, status: 'accepted', date: 'منذ ساعتين', source: 'demo' }
  ]);

  const allOrdersForAdmin = useMemo(() => {
    return [...realOrders, ...dashOrders].sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : Date.now();
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : Date.now() - 100000;
        return timeB - timeA;
    });
  }, [realOrders, dashOrders]);

  // --- C. FIREBASE INITIALIZATION & REAL-TIME CLOUD SYNC ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) { 
          await signInWithCustomToken(auth, __initial_auth_token); 
        } else { 
          await signInAnonymously(auth); 
        }
      } catch (err) { 
        console.error("Auth Fail in حلويات بوسي", err); 
      }
    };
    initAuth();
    
    const unsubscribe = onAuthStateChanged(auth, (u) => { 
      setUser(u); 
      setAppLoading(false); 
    });

    // --- [تحديث محرك حلويات بوسي]: التحقق من القفل الأمني واستعادة الجلسة السحابية المشفرة ---
    const lockedUntil = localStorage.getItem('bossy_admin_locked_until');
    if (lockedUntil && parseInt(lockedUntil) > Date.now()) {
        setIsAdminLocked(true);
        setAdminLockTimer(Math.ceil((parseInt(lockedUntil) - Date.now()) / 1000));
    } else {
        localStorage.removeItem('bossy_admin_locked_until');
    }

    const savedSession = sessionStorage.getItem('bossy_admin_active_session');
    if (savedSession && parseInt(savedSession) > Date.now()) {
        setIsAdminAuthenticated(true);
    } else {
        sessionStorage.removeItem('bossy_admin_active_session');
    }

    return () => {
      unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // --- [تحديث محرك حلويات بوسي]: حفظ تلقائي لبيانات التوصيل ---
  useEffect(() => {
      localStorage.setItem('bossy_secure_checkout_data', JSON.stringify(checkoutData));
  }, [checkoutData]);

  // --- [تحديث محرك حلويات بوسي]: Debounce لتخفيف الضغط على المتصفح أثناء البحث ---
  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedAdminSearch(adminSearchQuery);
      }, 300);
      return () => clearTimeout(timer);
  }, [adminSearchQuery]);

  useEffect(() => {
    if (!user) return;
    
    const cartRef = collection(db, 'artifacts', appId, 'users', user.uid, 'cart');
    const unsubscribeCart = onSnapshot(cartRef, 
      (snap) => { setCart(snap.docs.map(d => d.data()).sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))); }, 
      (err) => console.error("Cart Sync Error:", err)
    );
    
    const reviewsRef = collection(db, 'artifacts', appId, 'public', 'data', 'reviews');
    const unsubscribeReviews = onSnapshot(reviewsRef, 
      (snap) => { setReviews(snap.docs.map(d => ({id: d.id, ...d.data()}))); }, 
      (err) => console.error("Review Sync Error:", err)
    );

    const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'store_config', 'main');
    const unsubscribeStore = onSnapshot(storeRef, (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            if (data.products && data.products.length > 0) setAppProducts(data.products);
            if (data.categories && data.categories.length > 0) setAppCategories(data.categories);
            if (data.sections && data.sections.length > 0) setAppSections(data.sections);
            if (data.settings) setSettings({ ...initialGlobalSettings, ...data.settings });
            if (data.adminHash) setSecureHash(data.adminHash);
        }
    }, (err) => console.error("Store Sync Error", err));

    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    const unsubscribeOrders = onSnapshot(ordersRef, 
      (snap) => { setRealOrders(snap.docs.map(d => ({ id: d.id, ...d.data(), source: 'real' }))); }, 
      (err) => console.error("Orders Sync Error", err)
    );

    return () => { unsubscribeCart(); unsubscribeReviews(); unsubscribeStore(); unsubscribeOrders(); };
  }, [user]);

  // --- [تحديث محرك حلويات بوسي]: استخدام فلتر التنظيف قبل الحفظ السحابي ---
  const syncStoreToDb = async (key, data) => {
      if (!user) return;
      try {
          const safeData = cleanForFirestore(data);
          const storeRef = doc(db, 'artifacts', appId, 'public', 'data', 'store_config', 'main');
          await retryOperation(() => setDoc(storeRef, { [key]: safeData }, { merge: true }));
      } catch (err) { 
          console.error("Sync Error", err);
          showToast("فشل الحفظ السحابي لـ حلويات بوسي، يرجى المحاولة لاحقاً", "error"); 
      }
  };

  useEffect(() => {
    let interval;
    if (!isAdminAuthenticated && currentPage === 'home') {
        interval = setInterval(() => setLegacyIndex(prev => (prev + 1) % 3), 4500);
    }
    return () => clearInterval(interval);
  }, [isAdminAuthenticated, currentPage]);

  useEffect(() => {
    let urls = [...appCategories.map(c=>c.img), ...appProducts.map(p=>p.img)];
    appSections.forEach(s => { if(s.img) urls.push(s.img); if(s.images) urls.push(...s.images); });
    setLibraryImages(prev => [...new Set([...prev, ...urls])].filter(Boolean));
  }, [appCategories, appProducts, appSections]);

  useEffect(() => {
    const handleScroll = throttle(() => {
        setIsScrolled(window.scrollY > 20);
        setShowScrollTop(window.scrollY > 500);
    }, 200);
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // --- D. LOGIC HELPERS WITH MEMOIZATION ---
  const currentBestSellers = useMemo(() => appProducts.filter(p => superstarCandidates.includes(p.id)).slice(0, 4), [appProducts]);
  const currentNewArrivals = useMemo(() => appProducts.filter(p => newArrivalsPool.includes(p.id)).slice(0, 6), [appProducts]);
  const getSection = useCallback((id) => appSections.find(s => s.id === id) || {}, [appSections]);
  const isVisible = useCallback((id) => getSection(id).isVisible !== false, [getSection]);

  const showToast = useCallback((msg, type = 'success') => { 
    if (timeoutRef.current) clearTimeout(timeoutRef.current); 
    setToast({ message: msg, type }); 
    timeoutRef.current = setTimeout(() => setToast(null), 3000); 
  }, []);

  const navigate = useCallback((page, data = null, filter = 'الكل') => {
    setCurrentPage(page); setFilterCategory(filter);
    if (data) { setSelectedProduct(data); setActiveSizeIndex(0); }
    setIsSidebarOpen(false); setIsCartOpen(false); setQuickViewProduct(null); window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openQuickView = useCallback((product) => {
      setQuickViewProduct(product);
      setActiveSizeIndex(0);
  }, []);

  // 🌟 SMART RECOMMENDATIONS ENGINE (Stabilized per session) 🌟
  const getSmartRecommendations = useCallback((currentProductId, cartItems = [], limitCount = 4) => {
    const excludeIds = new Set(cartItems.map(c => c.productId));
    if (currentProductId) excludeIds.add(currentProductId);
    
    // Stable pseudo-random sort based on ID length + string content so it doesn't jitter on every render
    const availableProducts = appProducts.filter(p => !excludeIds.has(p.id));
    return [...availableProducts].sort((a,b) => {
        const valA = a.id.length + a.name.charCodeAt(0);
        const valB = b.id.length + b.name.charCodeAt(0);
        return (valA % 3) - (valB % 3); 
    }).slice(0, limitCount);
  }, [appProducts]);

  const cartRecommendations = useMemo(() => getSmartRecommendations(null, cart, 4), [cart, getSmartRecommendations]);
  const productRecommendations = useMemo(() => getSmartRecommendations(selectedProduct?.id, [], 4), [selectedProduct, getSmartRecommendations]);

  const handleQtyChange = useCallback((id, delta) => { setQuantities(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) })); }, []);

  // --- [تحديث محرك حلويات بوسي]: Optimistic UI Update للسلة عشان تكون طلقة ومتهنجش ---
  const addToCart = async (product, flavor, label = "") => {
    if (!user || !product || !flavor || isSyncing) return;
    const cartId = encodeURIComponent(`${product.id}-${label}-${flavor.name.replace(/\//g, '-')}`);
    const qtyToAdd = Number(quantities[cartId]) || 0;
    const actualQty = qtyToAdd > 0 ? qtyToAdd : 1; 
    const safePrice = Number(flavor.price) || 0;

    setIsSyncing(true);
    // Optimistic reset of input
    setQuantities(prev => ({ ...prev, [cartId]: 0 })); 
    showToast(`تم إضافة ${product.name} بنجاح للسلة الملكية الخاصة بـ حلويات بوسي`);
    if(quickViewProduct) setQuickViewProduct(null);

    try {
      const cartRef = doc(db, 'artifacts', appId, 'users', user.uid, 'cart', cartId);
      await retryOperation(() => runTransaction(db, async (transaction) => {
          const cartDoc = await transaction.get(cartRef);
          if (cartDoc.exists()) {
              const currentQty = Number(cartDoc.data().quantity) || 0;
              const newQty = currentQty + actualQty;
              transaction.update(cartRef, { quantity: newQty, timestamp: serverTimestamp() });
          } else {
              transaction.set(cartRef, {
                  cartId, productId: product.id, name: product.name,
                  flavor: flavor.name, label, price: safePrice,
                  quantity: actualQty, img: product.img, timestamp: serverTimestamp()
              });
          }
      }));
    } catch (err) { 
      showToast("حدث خطأ في النظام السحابي لـ حلويات بوسي، سيتم المزامنة لاحقاً", 'error'); 
      console.error(err);
    } finally { 
      setIsSyncing(false); 
    }
  };

  const removeCartItem = async (id) => { 
      if (!user || isSyncing) return; 
      setIsSyncing(true); 
      try { 
          await retryOperation(() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'cart', id))); 
      } finally { 
          setIsSyncing(false); 
      } 
  };

  // --- [تحديث محرك حلويات بوسي]: Optimistic UI لزر الزائد والناقص في السلة ---
  const updateCartQty = async (id, delta) => { 
    if (!user || isSyncing) return; 
    
    // Optimistic Update
    const itemIdx = cart.findIndex(c => c.cartId === id);
    if(itemIdx === -1) return;
    const currentItem = cart[itemIdx];
    const nextQty = Math.max(0, (Number(currentItem.quantity) || 0) + delta);
    
    if(nextQty === 0) {
        removeCartItem(id);
        return;
    }

    setIsSyncing(true);
    try {
        const cartRef = doc(db, 'artifacts', appId, 'users', user.uid, 'cart', id);
        await retryOperation(() => updateDoc(cartRef, { quantity: nextQty, timestamp: serverTimestamp() }));
    } catch(err) {
        console.error(err);
        showToast("جاري إعادة التزامن مع سيرفرات حلويات بوسي", 'error');
    } finally {
        setIsSyncing(false);
    }
  };

  const submitReview = async () => {
    if (!user || !selectedProduct || !newReview.text.trim() || !newReview.reviewerName.trim()) {
        showToast("برجاء كتابة اسمك الكريم وتقييمك الفاخر", "error");
        return;
    }
    setIsSyncing(true);
    try {
      await retryOperation(() => addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'reviews'), { 
        userId: user.uid, 
        productId: selectedProduct.id, 
        productName: selectedProduct.name, 
        reviewerName: newReview.reviewerName,
        text: newReview.text, 
        rating: newReview.rating, 
        timestamp: serverTimestamp() 
      }));
      setNewReview({ text: '', reviewerName: '', rating: 5 }); 
      showToast("تم إرسال التقييم الملكي بنجاح شكراً لاختياركم حلويات بوسي");
    } catch (err) { 
        console.error(err); 
        showToast("حدث خطأ أثناء حفظ التقييم", "error");
    } finally {
        setIsSyncing(false);
    }
  };

  const deleteReview = async (reviewId) => {
    if(window.confirm('تأكيد مسح التقييم ده من سجلات حلويات بوسي؟')) {
        try {
            await retryOperation(() => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reviews', reviewId)));
            showToast('تم مسح التقييم بنجاح', 'success');
        } catch (err) {
            showToast('حدث خطأ أثناء المسح', 'error');
        }
    }
  };

  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0), [cart]);
  const cartItemsCount = useMemo(() => cart.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0), [cart]);

  const sendWhatsAppOrder = async () => {
    if (!checkoutData.name || !checkoutData.address || !checkoutData.phone) { showToast("برجاء إكمال بيانات التوصيل لإتمام الطلب الملكي", 'error'); return; }
    if (cart.length === 0) { showToast("عذراً، السلة فارغة", 'error'); return; }
    
    const storePhone = settings.phone || "201097238441";
    const safeShipping = Number(settings.shippingCost) || 0;
    const orderTotal = cartTotal + safeShipping;

    if (user && !isSyncing) {
        setIsSyncing(true);
        try {
            await retryOperation(async () => {
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'orders'), {
                    userId: user.uid,
                    customer: checkoutData.name,
                    phone: checkoutData.phone,
                    address: checkoutData.address,
                    items: cart,
                    total: orderTotal,
                    status: 'pending',
                    timestamp: serverTimestamp()
                });
                
                const batch = writeBatch(db);
                cart.forEach((item) => {
                    const itemRef = doc(db, 'artifacts', appId, 'users', user.uid, 'cart', item.cartId);
                    batch.delete(itemRef);
                });
                await batch.commit();
            });

            setIsCartOpen(false);
            setCheckoutData({ name: '', address: '', phone: '' });
            localStorage.removeItem('bossy_secure_checkout_data'); // Clear after success
        } catch (err) {
            console.error("Failed to save order to DB", err);
            showToast("حدث خطأ أثناء رفع الطلب للإدارة، سيتم تحويلك للواتساب مباشرة", "error");
        } finally {
            setIsSyncing(false);
        }
    }

    let msg = `👑 *طلب ملكي جديد - حلويات بوسي*\n━━━━━━━━━━━━━━━━━━━━━\n👤 *العميل:* ${checkoutData.name}\n📍 *العنوان:* ${checkoutData.address}\n📞 *الهاتف:* ${checkoutData.phone}\n━━━━━━━━━━━━━━━━━━━━━\n🛒 *الطلبات:*\n\n`;
    cart.forEach((item, i) => { msg += `*${i + 1}. ${item.name}*\n   ▪ التفاصيل: ${item.label ? item.label + ' - ' : ''}${item.flavor}\n   ▪ الكمية: ${item.quantity}  |  السعر: ${(Number(item.price) || 0) * (Number(item.quantity) || 0)} ج.م\n\n`; });
    msg += `━━━━━━━━━━━━━━━━━━━━━\n💰 *الإجمالي الفرعي:* ${cartTotal} ج.م\n`;
    if(safeShipping > 0) msg += `🚚 *التوصيل:* ${safeShipping} ج.م\n`;
    msg += `✨ *شكراً لاختياركم حلويات بوسي* ✨`;
    window.open(`https://wa.me/${storePhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const filteredAllProducts = useMemo(() => {
      return appProducts.filter(p => filterCategory === 'الكل' ? true : p.category === filterCategory || p.id === filterCategory || p.name === filterCategory);
  }, [appProducts, filterCategory]);

  const filteredAdminProducts = useMemo(() => {
      return appProducts.filter(p => p.name.includes(debouncedAdminSearch));
  }, [appProducts, debouncedAdminSearch]);

  const filteredAdminCategories = useMemo(() => {
      return appCategories.filter(c => c.name.includes(debouncedAdminSearch));
  }, [appCategories, debouncedAdminSearch]);

  const filteredAdminOrders = useMemo(() => {
      return allOrdersForAdmin.filter(o => orderFilter === 'all' || o.source === orderFilter);
  }, [allOrdersForAdmin, orderFilter]);

  // --- E. ADMIN SECURITY LOGIC (ENTERPRISE HARDENED) ---
  useEffect(() => {
    let interval;
    if (isAdminLocked && adminLockTimer > 0) {
        interval = setInterval(() => {
            setAdminLockTimer(prev => {
                const newTime = prev - 1;
                if(newTime <= 0) {
                    localStorage.removeItem('bossy_admin_locked_until');
                    setIsAdminLocked(false); 
                    setAdminLoginAttempts(0);
                    return 0;
                }
                return newTime;
            });
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [isAdminLocked, adminLockTimer]);

  const handleAdminLogin = async (e) => {
    if (e && e.preventDefault) e.preventDefault(); 
    if (isAdminLocked) return;
    
    const cleanInput = adminPinInput.trim();
    if (!cleanInput) return;

    setIsLoggingIn(true); 

    try {
        const hashedInput = await hashPassword(cleanInput);
        const deviceId = getDeviceID();
        const allowedDevice = settings.allowedDevice;

        let isValid = false;

        const isFactoryDefault = (secureHash === 'QWFkbWlu' && cleanInput === 'Aadmin');

        if (hashedInput === secureHash || isFactoryDefault) {
             if (isFactoryDefault) {
                 setSecureHash(hashedInput);
                 syncStoreToDb('adminHash', hashedInput);
             }
             if (!allowedDevice) {
                 syncStoreToDb('settings', { ...settings, allowedDevice: deviceId });
                 isValid = true;
             } else if (allowedDevice === deviceId) {
                 isValid = true;
             } else {
                 await retryOperation(() => addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'admin_logs'), {
                     attempt: "login_device_rejected", ip: "hidden", device: deviceId, timestamp: serverTimestamp()
                 }));
                 showToast('عذراً، هذا الجهاز غير مصرح له بالدخول للنظام وفقاً لربط الأجهزة المعتمد لـ حلويات بوسي (Device Binding)', 'error');
                 setIsLoggingIn(false);
                 return;
             }
        }

        if (isValid) {
            await retryOperation(() => addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'admin_logs'), {
                attempt: "login_success", device: deviceId, timestamp: serverTimestamp()
            }));

            // --- [تحديث محرك حلويات بوسي]: حفظ الجلسة الإدارية بمتانة لمدة 4 ساعات ---
            sessionStorage.setItem('bossy_admin_active_session', (Date.now() + (4 * 60 * 60 * 1000)).toString());

            setIsAdminAuthenticated(true); 
            setAdminLoginAttempts(0);
            localStorage.removeItem('bossy_admin_locked_until');
            setCurrentPage('admin-dashboard'); 
            showToast('مرحباً بكِ في الإدارة العليا لـ حلويات بوسي', 'success'); 
            setAdminPinInput('');
        } else {
            await retryOperation(() => addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'admin_logs'), {
                attempt: "login_failed", input_length: cleanInput.length, device: deviceId, timestamp: serverTimestamp()
            }));

            const attempts = adminLoginAttempts + 1;
            setAdminLoginAttempts(attempts);
            if (attempts >= 3) { 
                setIsAdminLocked(true); 
                const lockDuration = 300;
                setAdminLockTimer(lockDuration); 
                localStorage.setItem('bossy_admin_locked_until', (Date.now() + lockDuration * 1000).toString());
                showToast('تم تفعيل بروتوكول الحماية الصارم لـ حلويات بوسي! النظام مقفل لمدة 5 دقائق', 'error'); 
            } else { 
                showToast(`الرمز السري غير صحيح. المتبقي ${3 - attempts} محاولات قبل الإغلاق الأمني`, 'error'); 
            }
        }
    } catch(err) {
        showToast('حدث خطأ في التحقق الأمني لـ حلويات بوسي', 'error');
    } finally {
        setIsLoggingIn(false);
    }
  };

  const saveNewPassword = async () => {
    const input = newPasswordInput.trim();
    if(!input) { showToast('يرجى كتابة كلمة مرور صالحة تليق بنظام حلويات بوسي', 'error'); return; }
    
    const newHash = await hashPassword(input); 
    setSecureHash(newHash); 
    syncStoreToDb('adminHash', newHash);
    
    setNewPasswordInput(''); 
    showToast('تم تشفير وحفظ كلمة المرور الجديدة باستخدام بروتوكولات حماية حلويات بوسي (SHA-256 with Salt)', 'success');
  };

  // --- F. ADMIN CLOUD ACTIONS ---
  const closeAdminModal = () => setAdminModalConfig({ isOpen: false, type: '', mode: 'add', data: null });
  const openAdminModal = (type, mode = 'add', data = null) => setAdminModalConfig({ isOpen: true, type, mode, data: data ? JSON.parse(JSON.stringify(data)) : null });

  const moveSection = (idx, dir) => {
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === appSections.length - 1)) return;
    const arr = [...appSections]; const temp = arr[idx]; arr[idx] = arr[idx + dir]; arr[idx + dir] = temp;
    setAppSections(arr); syncStoreToDb('sections', arr); showToast('تم تحديث الترتيب بالموقع الحي لـ حلويات بوسي');
  };
  const toggleSectionVisibility = (id) => { 
      const updated = appSections.map(s => s.id === id ? { ...s, isVisible: !s.isVisible } : s);
      setAppSections(updated); syncStoreToDb('sections', updated); showToast('تم تحديث الرؤية بموقع حلويات بوسي'); 
  };
  const duplicateSection = (secIndex) => {
      const secToCopy = appSections[secIndex];
      const newSec = JSON.parse(JSON.stringify({ ...secToCopy, id: `sec_${Date.now()}`, title: `${secToCopy.title} (نسخة)` }));
      const updated = [...appSections];
      updated.splice(secIndex + 1, 0, newSec);
      setAppSections(updated);
      syncStoreToDb('sections', updated);
      showToast('تم استنساخ القسم بنجاح.. تقدري تعدليه دلوقتي');
  };
  const saveSection = (formData) => { 
      const updated = appSections.map(s => s.id === formData.id ? formData : s);
      setAppSections(updated); syncStoreToDb('sections', updated); closeAdminModal(); showToast('تم الحفظ وتحديث الواجهة بنجاح'); 
  };
  const saveCategory = (cat) => { 
      let updated;
      if (adminModalConfig.mode === 'add') updated = [{ ...cat, id: `cat_${Date.now()}` }, ...appCategories]; else updated = appCategories.map(c => c.id === cat.id ? cat : c); 
      setAppCategories(updated); syncStoreToDb('categories', updated); closeAdminModal(); showToast('تم تحديث الأقسام بموقع حلويات بوسي'); 
  };
  const deleteCategory = (id) => { 
      if(window.confirm('تأكيد الحذف من واجهة حلويات بوسي؟')) { const updated = appCategories.filter(c => c.id !== id); setAppCategories(updated); syncStoreToDb('categories', updated); showToast('تم الحذف بنجاح', 'error'); } 
  };
  const saveProduct = (prod) => { 
      let updated;
      if (adminModalConfig.mode === 'add') updated = [{ ...prod, id: `prod_${Date.now()}` }, ...appProducts]; else updated = appProducts.map(p => p.id === prod.id ? prod : p); 
      setAppProducts(updated); syncStoreToDb('products', updated); closeAdminModal(); showToast('تم التحديث بمنيو حلويات بوسي'); 
  };
  const deleteProduct = (id) => { 
      if(window.confirm('تأكيد الحذف؟ سيزال من موقع حلويات بوسي نهائياً.')) { const updated = appProducts.filter(p => p.id !== id); setAppProducts(updated); syncStoreToDb('products', updated); showToast('تم الحذف بنجاح', 'error'); } 
  };

  // ========================================================
  // SECTION 6: RENDER VIEWS (UI KEPT EXACTLY IDENTICAL + ADDITIONS)
  // ========================================================

  // --- 1. ADMIN MODALS (UPGRADED FOR FULL DYNAMIC CONTROL) ---
  const MediaPicker = ({ onSelect, onCancel }) => (
    <div className="mt-3 p-4 bg-slate-900 rounded-xl border border-slate-700 shadow-inner">
        <div className="flex justify-between items-center mb-3"><span className="text-xs font-bold text-slate-300">مكتبة صور حلويات بوسي</span><button type="button" onClick={onCancel} className="text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg">إلغاء</button></div>
        {libraryImages.length === 0 ? <p className="text-xs text-center text-slate-500 py-4">المكتبة فارغة</p> : (
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {libraryImages.map((img, idx) => <img key={idx} src={img} onClick={() => onSelect(img)} className="w-full h-16 object-cover rounded-lg cursor-pointer border-2 border-transparent hover:border-pink-500 transition-all hover:scale-105" alt=""/>)}
            </div>
        )}
    </div>
  );

  const SectionMetaModal = () => {
    const [formData, setFormData] = useState(adminModalConfig.data || {});
    const [newImgUrl, setNewImgUrl] = useState('');
    const inputClass = "w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 transition-all font-bold text-sm";
    
    const toggleProductSelection = (productId) => {
        const current = formData.selectedProducts || [];
        const updated = current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId];
        setFormData({ ...formData, selectedProducts: updated });
    };

    const addImageToSection = () => {
        if(newImgUrl) {
            setFormData({ ...formData, images: [...(formData.images || []), newImgUrl] });
            setNewImgUrl('');
        }
    };

    const removeImageFromSection = (idx) => {
        const updated = [...(formData.images || [])];
        updated.splice(idx, 1);
        setFormData({ ...formData, images: updated });
    };

    const isImageSection = ['waterfall', 'slider'].includes(formData.type) || formData.images !== undefined;
    const isProductSection = ['products_slider', 'products_grid'].includes(formData.type) || formData.selectedProducts !== undefined;

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex justify-center items-center p-4 text-right" dir="rtl">
            <div className="bg-slate-800 w-full max-w-2xl rounded-[30px] border border-slate-700 p-6 md:p-8 animate-slide max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2"><LayoutList className="text-pink-500"/> تعديل قسم: {formData.title}</h3>
                    <button onClick={closeAdminModal} className="bg-slate-700 text-slate-300 p-2 rounded-full hover:bg-slate-600"><X size={20}/></button>
                </div>
                
                <div className="space-y-6">
                    <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-700/50 space-y-4">
                        <h4 className="text-pink-400 font-bold text-sm mb-2 flex items-center gap-2"><Settings size={16}/> البيانات الأساسية للقسم</h4>
                        <div><label className="text-xs font-bold block mb-2 text-slate-400">العنوان المعروض للجمهور</label><input type="text" value={formData.heading || ''} onChange={e => setFormData({...formData, heading: e.target.value})} className={inputClass} /></div>
                        <div><label className="text-xs font-bold block mb-2 text-slate-400">النص الوصفي لـ حلويات بوسي</label><textarea value={formData.desc || ''} onChange={e => setFormData({...formData, desc: e.target.value})} className={`${inputClass} h-24 resize-none`}></textarea></div>
                    </div>

                    {isProductSection && (
                        <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-700/50">
                            <h4 className="text-pink-400 font-bold text-sm mb-4 flex items-center gap-2"><Package size={16}/> المنتجات المعروضة في هذا القسم (اختيار متعدد)</h4>
                            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                {appProducts.map(p => {
                                    const isSelected = (formData.selectedProducts || []).includes(p.id);
                                    return (
                                        <button key={p.id} onClick={() => toggleProductSelection(p.id)} className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${isSelected ? 'bg-pink-600 text-white border-pink-500 shadow-lg shadow-pink-500/20' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-pink-500/50'}`}>
                                            {p.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {isImageSection && (
                        <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-700/50">
                            <h4 className="text-pink-400 font-bold text-sm mb-4 flex items-center gap-2"><ImageIcon size={16}/> إدارة صور القسم</h4>
                            <div className="flex gap-2 mb-4">
                                <input type="text" placeholder="رابط الصورة الجديدة..." value={newImgUrl} onChange={e => setNewImgUrl(e.target.value)} className={`${inputClass} flex-1 text-left`} dir="ltr" />
                                <button type="button" onClick={addImageToSection} className="bg-slate-700 text-white px-4 rounded-xl font-bold hover:bg-slate-600"><Plus size={20}/></button>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                {(formData.images || []).map((img, idx) => (
                                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-700">
                                        <img src={img} className="w-full h-20 object-cover" alt="" />
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => removeImageFromSection(idx)} className="bg-red-500 text-white p-1.5 rounded-lg"><Trash size={14}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={() => saveSection(formData)} className="w-full bg-pink-600 text-white font-bold py-4 rounded-xl hover:bg-pink-500 transition shadow-lg shadow-pink-600/20">حفظ التعديلات ونشرها للعملاء</button>
                </div>
            </div>
        </div>
    );
  };

  const CategoryModal = () => {  
    const [formData, setFormData] = useState(adminModalConfig.data || { name: '', id: '', img: '' });
    const [showPicker, setShowPicker] = useState(false);
    const inputClass = "w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 transition-all font-bold";
    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex justify-center items-center p-4 text-right" dir="rtl">
            <div className="bg-slate-800 w-full max-w-md rounded-[30px] border border-slate-700 p-8 animate-slide overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4"><h3 className="font-bold text-xl text-white">{adminModalConfig.mode === 'add' ? 'قسم جديد بمنيو حلويات بوسي' : 'تعديل القسم'}</h3><button onClick={closeAdminModal} className="bg-slate-700 text-slate-300 p-2 rounded-full hover:bg-slate-600"><X size={20}/></button></div>
                <div className="space-y-4">
                    <div><label className="text-xs font-bold block mb-2 text-slate-400">اسم القسم</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value, id: formData.id || e.target.value.toLowerCase()})} className={inputClass} /></div>
                    <div>
                        <div className="flex justify-between items-center mb-2"><label className="text-xs font-bold text-slate-400">صورة القسم</label><button type="button" onClick={() => setShowPicker(!showPicker)} className="text-xs font-bold text-pink-400 bg-pink-500/10 px-3 py-1.5 rounded-lg hover:bg-pink-500/20 transition">تصفح المكتبة</button></div>
                        <input type="text" value={formData.img} onChange={e => setFormData({...formData, img: e.target.value})} className={`${inputClass} text-left text-xs`} dir="ltr" placeholder="رابط خارجي..." />
                        {showPicker && <MediaPicker onSelect={img => {setFormData({...formData, img}); setShowPicker(false);}} onCancel={() => setShowPicker(false)} />}
                        {formData.img && !showPicker && <img src={formData.img} className="mt-4 w-full h-32 object-cover rounded-2xl border border-slate-600 shadow-sm" alt=""/>}
                    </div>
                    <button onClick={() => saveCategory(formData)} className="w-full bg-pink-600 text-white font-bold py-4 rounded-xl mt-4 hover:bg-pink-500 transition">حفظ وتحديث الموقع</button>
                </div>
            </div>
        </div>
    );
  };

  const ProductModal = () => { 
    const [formData, setFormData] = useState(adminModalConfig.data || { name: '', desc: '', img: '', category: '', flavors: [], options: [] });
    const [isComplex, setIsComplex] = useState(!!(adminModalConfig.data?.options && adminModalConfig.data.options.length > 0));
    const [newFlavor, setNewFlavor] = useState({ name: '', price: '' });
    const [newOptionLabel, setNewOptionLabel] = useState('');
    const [activeOptionIdx, setActiveOptionIdx] = useState(0);
    const [showPicker, setShowPicker] = useState(false);
    const inputClass = "w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 transition-all font-bold text-sm";
    
    const addSimpleFlavor = () => { if(newFlavor.name && newFlavor.price) { setFormData({...formData, flavors: [...(formData.flavors||[]), { ...newFlavor, id: Date.now() }]}); setNewFlavor({ name: '', price: '' }); } };
    
    const addOption = () => {
        if(newOptionLabel) {
            const updatedOptions = [...(formData.options || []), { label: newOptionLabel, flavors: [] }];
            setFormData({ ...formData, options: updatedOptions });
            setNewOptionLabel('');
            setActiveOptionIdx(updatedOptions.length - 1);
        }
    };

    const addOptionFlavor = () => {
        if(newFlavor.name && newFlavor.price && formData.options && formData.options[activeOptionIdx]) {
            const updatedOptions = [...formData.options];
            updatedOptions[activeOptionIdx].flavors.push({ ...newFlavor, id: Date.now() });
            setFormData({ ...formData, options: updatedOptions });
            setNewFlavor({ name: '', price: '' });
        }
    };

    const removeOptionFlavor = (optIdx, flavorId) => {
        const updatedOptions = [...formData.options];
        updatedOptions[optIdx].flavors = updatedOptions[optIdx].flavors.filter(f => f.id !== flavorId);
        setFormData({ ...formData, options: updatedOptions });
    };

    const removeOption = (optIdx) => {
        const updatedOptions = [...formData.options];
        updatedOptions.splice(optIdx, 1);
        setFormData({ ...formData, options: updatedOptions });
        setActiveOptionIdx(0);
    };

    const handleComplexToggle = (complex) => {
        setIsComplex(complex);
        if (complex && (!formData.options || formData.options.length === 0)) {
            setFormData({ ...formData, options: [{ label: 'حجم مخصص', flavors: [] }] });
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[100] flex justify-center items-center p-4 text-right" dir="rtl">
            <div className="bg-slate-800 w-full max-w-2xl rounded-[30px] border border-slate-700 p-6 md:p-8 animate-slide max-h-[95vh] overflow-y-auto custom-scrollbar shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2"><Package className="text-pink-500"/> {adminModalConfig.mode === 'add' ? 'إضافة منتج لـ حلويات بوسي' : 'تعديل منتج شامل'}</h3>
                    <button onClick={closeAdminModal} className="bg-slate-700 text-slate-300 p-2 rounded-full hover:bg-slate-600"><X size={20}/></button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-4">
                        <div><label className="text-xs font-bold mb-2 block text-slate-400">اسم المنتج المتميز</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={inputClass} placeholder="مثال: الديسباسيتو"/></div>
                        <div><label className="text-xs font-bold mb-2 block text-slate-400">القسم / التصنيف</label><select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className={inputClass}><option value="">اختر القسم...</option>{appCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-2"><label className="text-xs font-bold text-slate-400">الصورة الاحترافية</label><button type="button" onClick={() => setShowPicker(!showPicker)} className="text-xs font-bold text-pink-400 bg-pink-500/10 px-3 py-1.5 rounded-lg hover:bg-pink-500/20">المكتبة</button></div>
                            <input type="text" value={formData.img} onChange={e => setFormData({...formData, img: e.target.value})} className={`${inputClass} text-left text-xs mb-2`} dir="ltr" placeholder="URL..." />
                            {showPicker && <MediaPicker onSelect={img => {setFormData({...formData, img}); setShowPicker(false);}} onCancel={() => setShowPicker(false)} />}
                            {formData.img && !showPicker && <img src={formData.img} className="w-full h-24 rounded-2xl object-cover border border-slate-600 shadow-inner" alt=""/>}
                        </div>
                    </div>
                </div>

                <div className="mb-6"><label className="text-xs font-bold mb-2 block text-slate-400">الوصف التفصيلي (تسويقي لـ حلويات بوسي)</label><textarea value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} className={`${inputClass} h-20 resize-none`}></textarea></div>

                <div className="bg-slate-900/80 p-5 rounded-[24px] border border-slate-700">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4 border-b border-slate-700 pb-4">
                        <h4 className="text-sm font-black text-white flex items-center gap-2"><Flame size={18} className="text-pink-500"/> بناء النكهات والأسعار</h4>
                        <div className="flex bg-slate-800 p-1 rounded-xl w-full sm:w-auto">
                            <button onClick={()=>handleComplexToggle(false)} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition ${!isComplex ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}>نكهات مباشرة</button>
                            <button onClick={()=>handleComplexToggle(true)} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition ${isComplex ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}>أحجام متعددة (خيارات)</button>
                        </div>
                    </div>

                    {!isComplex ? (
                        <div className="animate-fadeIn">
                            <div className="flex gap-2 mb-4"><input type="text" placeholder="اسم النكهة (مثال: نوتيلا)" value={newFlavor.name} onChange={e => setNewFlavor({...newFlavor, name: e.target.value})} className={`${inputClass} flex-1`} /><input type="number" placeholder="السعر" value={newFlavor.price} onChange={e => setNewFlavor({...newFlavor, price: e.target.value})} className={`${inputClass} w-24 text-center`} /><button type="button" onClick={addSimpleFlavor} className="bg-pink-600 text-white w-14 rounded-xl flex items-center justify-center hover:bg-pink-500"><Plus size={20}/></button></div>
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                {(formData.flavors || []).map(f => (
                                    <div key={f.id || f.name} className="flex justify-between items-center bg-slate-800 p-3 rounded-xl border border-slate-700 shadow-sm"><span className="text-slate-200 text-sm font-bold">{f.name}</span><div className="flex items-center gap-3"><span className="text-pink-400 font-black text-sm">{f.price} ج</span><button type="button" onClick={() => setFormData({...formData, flavors: formData.flavors.filter(x => (x.id || x.name) !== (f.id || f.name))})} className="text-red-400 p-1.5 bg-red-500/10 rounded-lg hover:bg-red-50 hover:text-white transition"><Trash size={14}/></button></div></div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="animate-fadeIn">
                            <div className="flex gap-2 mb-6">
                                <input type="text" placeholder="اسم الحجم الجديد (مثال: الحجم العائلي)" value={newOptionLabel} onChange={e=>setNewOptionLabel(e.target.value)} className={`${inputClass} flex-1 border-pink-500/30 bg-pink-500/5`} />
                                <button type="button" onClick={addOption} className="bg-slate-700 text-white px-4 rounded-xl font-bold hover:bg-slate-600 flex items-center gap-1 text-xs">إضافة خيار <Layers size={14}/></button>
                            </div>
                            
                            {(formData.options || []).length > 0 && (
                                <div className="flex flex-col md:flex-row gap-4">
                                    <div className="w-full md:w-1/3 flex flex-col gap-2">
                                        {(formData.options || []).map((opt, idx) => (
                                            <div key={idx} className={`flex justify-between items-center px-4 py-3 rounded-xl cursor-pointer font-bold text-sm transition-all border ${activeOptionIdx === idx ? 'bg-pink-600 border-pink-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-pink-500/50'}`} onClick={()=>setActiveOptionIdx(idx)}>
                                                <span>{opt.label}</span>
                                                <button onClick={(e)=>{e.stopPropagation(); removeOption(idx);}} className={`p-1 rounded-md ${activeOptionIdx === idx ? 'hover:bg-pink-700' : 'hover:text-red-400 hover:bg-red-500/10'}`}><Trash size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="w-full md:w-2/3 bg-slate-800 p-4 rounded-2xl border border-slate-700 min-h-[200px]">
                                        <h5 className="text-xs font-bold text-slate-400 mb-4 border-b border-slate-700 pb-2">النكهات المتوفرة لـ: <span className="text-pink-400">{formData.options[activeOptionIdx]?.label}</span></h5>
                                        <div className="flex gap-2 mb-4"><input type="text" placeholder="النكهة" value={newFlavor.name} onChange={e => setNewFlavor({...newFlavor, name: e.target.value})} className={`${inputClass} py-2`} /><input type="number" placeholder="السعر" value={newFlavor.price} onChange={e => setNewFlavor({...newFlavor, price: e.target.value})} className={`${inputClass} py-2 w-20 text-center`} /><button type="button" onClick={addOptionFlavor} className="bg-slate-700 text-white w-12 rounded-xl flex items-center justify-center hover:bg-pink-600 transition"><Plus size={16}/></button></div>
                                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                                            {(formData.options[activeOptionIdx]?.flavors || []).map((f) => (
                                                <div key={f.id || f.name} className="flex justify-between items-center bg-slate-900 p-2.5 rounded-lg border border-slate-700 shadow-sm"><span className="text-slate-300 text-xs font-bold">{f.name}</span><div className="flex items-center gap-3"><span className="text-pink-400 font-black text-xs">{f.price} ج</span><button type="button" onClick={() => removeOptionFlavor(activeOptionIdx, f.id || f.name)} className="text-red-400 p-1 bg-red-500/10 rounded-md hover:bg-red-500 hover:text-white transition"><X size={14}/></button></div></div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="mt-8">
                    <button onClick={() => saveProduct(formData)} className="w-full bg-gradient-to-r from-pink-600 to-pink-500 text-white font-black text-lg py-4 rounded-xl hover:shadow-[0_10px_30px_rgba(216,27,96,0.3)] hover:-translate-y-1 transition-all">بناء وحفظ بمنيو حلويات بوسي</button>
                </div>
            </div>
        </div>
    );
  };

  // --- 2. ADMIN DASHBOARD MAIN VIEW ---
  const renderAdminDashboard = () => {
    const SidebarBtn = ({ id, icon: IconComp, label }) => (
        <button onClick={() => { setActiveAdminTab(id); setIsAdminMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 px-5 py-4 mb-2 rounded-2xl font-bold text-sm transition-all ${activeAdminTab === id ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <IconComp size={20} /> {label}
        </button>
    );

    return (
        <div className="flex h-screen bg-[#0f172a] text-right text-white overflow-hidden font-cairo relative" dir="rtl">
            {isAdminMobileMenuOpen && (<div className="fixed inset-0 bg-slate-950/80 z-[500] md:hidden backdrop-blur-sm" onClick={() => setIsAdminMobileMenuOpen(false)}></div>)}
            <aside className={`fixed inset-y-0 right-0 z-[600] w-72 bg-[#0f172a] flex flex-col border-l border-slate-800 p-6 overflow-y-auto transform transition-transform duration-300 md:relative md:translate-x-0 ${isAdminMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <button onClick={() => setIsAdminMobileMenuOpen(false)} className="absolute top-4 left-4 md:hidden text-slate-500 hover:text-white"><X size={24} /></button>
                <div className="mb-10 text-center mt-4 md:mt-0">
                    <div className="w-16 h-16 bg-gradient-to-tr from-pink-500 to-pink-600 rounded-2xl mx-auto flex items-center justify-center font-black text-2xl mb-3 shadow-lg shadow-pink-500/30">B</div>
                    <h1 className="text-xl font-black">حلويات بوسي</h1>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Enterprise CMS</p>
                </div>
                <nav className="flex-1 space-y-1">
                    <SidebarBtn id="dashboard" icon={Home} label="نظرة عامة ومراقبة" />
                    <SidebarBtn id="orders" icon={ShoppingCart} label={`الطلبات الحية (${filteredAdminOrders.length})`} />
                    <SidebarBtn id="reviews" icon={MessageSquare} label={`التقييمات الملكية (${reviews.length})`} />
                    <SidebarBtn id="homepage" icon={Layers} label="إدارة الواجهة الحية" />
                    <SidebarBtn id="layout" icon={Layout} label="هيكل الموقع (الشريط والفوتر)" />
                    <SidebarBtn id="categories" icon={Grid} label="الأقسام والمنيو" />
                    <SidebarBtn id="products" icon={Package} label="قائمة المنتجات المتقدمة" />
                    <SidebarBtn id="settings" icon={Shield} label="الإعدادات والأمان" />
                </nav>
                <button onClick={() => { setIsAdminAuthenticated(false); setCurrentPage('home'); }} className="mt-10 w-full text-red-400 bg-red-500/10 py-3.5 rounded-xl font-bold text-sm hover:bg-red-50 hover:text-white transition shadow-sm">العودة لمتجر حلويات بوسي</button>
            </aside>

            <main className="flex-1 flex flex-col bg-[#1e293b] overflow-hidden w-full">
                <header className="bg-slate-900 px-4 md:px-8 py-5 flex justify-between items-center border-b border-slate-800 shadow-sm gap-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsAdminMobileMenuOpen(true)} className="md:hidden text-slate-400 hover:text-white p-1"><Menu size={26} /></button>
                        <h2 className="text-xl md:text-2xl font-black truncate">{activeAdminTab === 'dashboard' ? 'مراقبة أداء حلويات بوسي' : 'إدارة الموقع المتقدمة'}</h2>
                    </div>
                    <div className="bg-slate-800 border border-slate-700 px-3 md:px-4 py-2 rounded-xl text-[10px] md:text-xs font-bold text-green-400 flex items-center gap-2 whitespace-nowrap shadow-inner">سحابة حلويات بوسي <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_#22c55e]"></span></div>
                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                    {activeAdminTab === 'dashboard' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                                <div onClick={()=>setActiveAdminTab('products')} className="bg-slate-800 p-6 md:p-8 rounded-[24px] md:rounded-[30px] border border-slate-700 hover:border-pink-500 transition-all cursor-pointer shadow-sm"><p className="text-slate-400 text-xs md:text-sm font-bold mb-2">إجمالي منتجات حلويات بوسي</p><h3 className="text-3xl md:text-4xl font-black text-white">{appProducts.length}</h3></div>
                                <div onClick={()=>setActiveAdminTab('categories')} className="bg-slate-800 p-6 md:p-8 rounded-[24px] md:rounded-[30px] border border-slate-700 hover:border-blue-500 transition-all cursor-pointer shadow-sm"><p className="text-slate-400 text-xs md:text-sm font-bold mb-2">الأقسام المعروضة</p><h3 className="text-3xl md:text-4xl font-black text-white">{appCategories.length}</h3></div>
                                <div onClick={()=>setActiveAdminTab('reviews')} className="bg-slate-800 p-6 md:p-8 rounded-[24px] md:rounded-[30px] border border-slate-700 hover:border-yellow-500 transition-all cursor-pointer shadow-sm"><p className="text-slate-400 text-xs md:text-sm font-bold mb-2">إجمالي التقييمات</p><h3 className="text-3xl md:text-4xl font-black text-white">{reviews.length}</h3></div>
                                <div onClick={()=>setActiveAdminTab('orders')} className="bg-slate-800 p-6 md:p-8 rounded-[24px] md:rounded-[30px] border border-slate-700 hover:border-green-500 transition-all cursor-pointer shadow-sm"><p className="text-slate-400 text-xs md:text-sm font-bold mb-2">إجمالي الطلبات (الكل)</p><h3 className="text-3xl md:text-4xl font-black text-white">{allOrdersForAdmin.length}</h3></div>
                            </div>
                        </div>
                    )}

                    {activeAdminTab === 'reviews' && (
                        <div className="animate-fadeIn space-y-6">
                            <div className="bg-slate-900 border border-slate-700 p-5 rounded-[20px] flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                                <div><h3 className="font-black text-lg text-white">إدارة آراء العملاء</h3><p className="text-xs text-slate-400">تابع تقييمات حلويات بوسي وامسح أي تقييم غير لائق فورا.</p></div>
                            </div>
                            <div className="grid gap-4">
                                {reviews.length === 0 ? (
                                    <div className="text-center text-slate-500 py-10 font-bold bg-slate-800 rounded-[20px] border border-slate-700 shadow-sm">لا توجد تقييمات لعرضها حالياً.</div>
                                ) : (
                                    [...reviews].sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0)).map((rev, idx) => (
                                        <div key={idx} className="bg-slate-800 p-6 rounded-[20px] border border-slate-700 flex flex-col md:flex-row justify-between gap-6 transition-all hover:border-pink-500/50">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <span className="text-pink-400 font-bold text-lg">{rev.reviewerName}</span>
                                                    <div className="flex text-yellow-400">
                                                        {[...Array(5)].map((_, i) => (
                                                            <Star key={i} size={14} className={i < rev.rating ? "fill-current" : "text-slate-600"} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-slate-300 text-sm mb-3 bg-slate-900 p-3 rounded-xl border border-slate-700 shadow-inner leading-relaxed">"{rev.text}"</p>
                                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                                    <Package size={14}/> تقييم لمنتج: <span className="text-pink-300 font-bold">{rev.productName}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-end">
                                                <button onClick={() => deleteReview(rev.id)} className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition shadow-sm"><Trash2 size={20}/></button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeAdminTab === 'orders' && (
                        <div className="animate-fadeIn space-y-6">
                            <div className="bg-slate-900 border border-slate-700 p-5 rounded-[20px] flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm">
                                <div><h3 className="font-black text-lg text-white">سجل طلبات حلويات بوسي</h3><p className="text-xs text-slate-400">تتبع الطلبات الحية القادمة من العملاء.</p></div>
                                <div className="flex bg-slate-800 rounded-xl p-1 border border-slate-700">
                                    <button onClick={()=>setOrderFilter('all')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${orderFilter==='all' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}>الكل</button>
                                    <button onClick={()=>setOrderFilter('real')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${orderFilter==='real' ? 'bg-pink-600 text-white' : 'text-slate-400 hover:text-white'}`}>الطلبات الحقيقية</button>
                                </div>
                            </div>
                            
                            <div className="grid gap-4">
                                {filteredAdminOrders.length === 0 ? (
                                    <div className="text-center text-slate-500 py-10 font-bold bg-slate-800 rounded-[20px] border border-slate-700 shadow-sm">لا توجد طلبات لعرضها حالياً في سجلات حلويات بوسي.</div>
                                ) : (
                                    filteredAdminOrders.map((order, idx) => (
                                        <div key={idx} className={`bg-slate-800 p-6 rounded-[20px] border ${order.source === 'real' ? 'border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.1)]' : 'border-slate-700'} flex flex-col md:flex-row justify-between gap-6 transition-all`}>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-4">
                                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase ${order.source === 'real' ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-700 text-slate-300'}`}>{order.source === 'real' ? 'طلب سحابي حقيقي' : 'نموذج للتجربة'}</span>
                                                    <span className="text-slate-400 text-xs">{order.id || `طلب_حي_${idx}`}</span>
                                                    <span className="text-slate-500 text-xs flex items-center gap-1"><Clock size={12}/> {order.date || 'الآن'}</span>
                                                </div>
                                                <h4 className="font-bold text-white mb-1 flex items-center gap-2"><User size={16} className="text-pink-400"/> {order.customer}</h4>
                                                <p className="text-slate-400 text-sm mb-1 flex items-center gap-2"><Phone size={14} className="text-pink-400"/> {order.phone}</p>
                                                {order.address && <p className="text-slate-400 text-sm flex items-center gap-2"><MapPin size={14} className="text-pink-400"/> {order.address}</p>}
                                            </div>
                                            <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 flex-1 shadow-inner">
                                                <h5 className="text-xs font-bold text-slate-400 mb-3 border-b border-slate-700 pb-2">محتويات الطلب الملكي</h5>
                                                <ul className="space-y-2 mb-3 max-h-24 overflow-y-auto custom-scrollbar pr-2">
                                                    {order.items.map((item, i) => (
                                                        <li key={i} className="text-sm text-slate-300 flex justify-between font-bold">
                                                            <span><span className="text-pink-400 mr-1">{item.quantity || item.qty}x</span> {item.name} {item.flavor ? `(${item.flavor})` : ''}</span>
                                                            <span className="text-slate-500">{(Number(item.price)||0) * (Number(item.quantity) || Number(item.qty) || 0)} ج</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                                                    <span className="text-slate-400 font-bold text-sm">الإجمالي:</span>
                                                    <span className="text-pink-400 font-black text-lg">{order.total} ج.م</span>
                                                </div>
                                            </div>
                                            {order.source === 'real' && (
                                                <div className="flex items-center justify-end">
                                                    <button onClick={() => deleteOrder(order.id)} className="p-3 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-50 hover:text-white transition shadow-sm"><Trash2 size={20}/></button>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {activeAdminTab === 'homepage' && (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="bg-slate-900 border border-pink-500/30 text-white p-4 md:p-6 rounded-[20px] md:rounded-[30px] mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
                                <div><h3 className="font-black text-lg md:text-xl text-pink-400 flex items-center gap-2"><LayoutList size={24}/> إدارة الواجهة الحية لـ حلويات بوسي (Live UI Builder)</h3><p className="text-xs text-slate-400 mt-2 font-bold leading-relaxed">تحكم كامل في كل قسم معروض. تقدري تنسخي قسم، تغيري ترتيبه، تختاري المنتجات المعروضة جواه، أو تغيري صوره. كل حفظ بيظهر للعميل فوراً.</p></div>
                            </div>
                            {appSections.map((sec, idx) => (
                                <div key={sec.id} className={`bg-slate-800 p-4 md:p-6 rounded-[20px] md:rounded-[24px] flex flex-col md:flex-row items-start md:items-center justify-between transition-all border gap-4 shadow-sm ${sec.isVisible ? 'border-slate-700' : 'border-dashed border-slate-600 opacity-50 bg-slate-900/50'}`}>
                                    <div className="flex gap-4 items-center w-full md:w-auto">
                                        <div className="flex md:flex-col gap-1 bg-slate-900/80 rounded-xl p-2 border border-slate-700 text-center shadow-inner">
                                            <button onClick={() => moveSection(idx, -1)} className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition"><ArrowUp size={14}/></button>
                                            <button onClick={() => moveSection(idx, 1)} className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded-md transition"><ArrowDown size={14}/></button>
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-[10px] font-bold text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded-lg border border-pink-500/20 inline-block mb-1 shadow-sm">قسم بواجهة حلويات بوسي</span>
                                            <h4 className="font-bold text-base md:text-lg text-white mb-1 flex items-center gap-2">{sec.title}</h4>
                                            <p className="text-xs text-slate-400 truncate max-w-[200px]">العنوان المعروض: <span className="text-pink-300">{sec.heading}</span></p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                                        <button onClick={() => duplicateSection(idx)} className="px-3 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm bg-slate-700 text-slate-300 hover:bg-slate-600 flex items-center gap-1" title="استنساخ هذا القسم"><Copy size={14}/> استنساخ</button>
                                        <button onClick={() => toggleSectionVisibility(sec.id)} className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm border border-transparent ${sec.isVisible ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500 hover:text-white'}`}>{sec.isVisible ? 'إخفاء' : 'إظهار'}</button>
                                        <button onClick={() => openAdminModal('homepage_section', 'edit', sec)} className="px-5 py-2.5 bg-pink-600 text-white rounded-xl text-xs font-bold hover:bg-pink-500 transition shadow-lg shadow-pink-600/20"><Edit size={14} className="inline mr-1"/> إعدادات القسم</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {activeAdminTab === 'layout' && (
                        <div className="max-w-4xl space-y-6 animate-fadeIn">
                            <div className="bg-slate-900 border border-pink-500/30 text-white p-4 md:p-6 rounded-[20px] mb-6 shadow-sm">
                                <h3 className="font-black text-lg md:text-xl text-pink-400 flex items-center gap-2"><Layout size={24}/> الهيكل الأساسي لـ حلويات بوسي</h3><p className="text-xs text-slate-400 mt-2 font-bold">من هنا تقدري تتحكمي في الكلام اللي بيظهر في الشريط اللي بيجري فوق، القائمة الجانبية، والفوتر (أسفل الموقع).</p>
                            </div>

                            <div className="bg-slate-800 p-6 md:p-8 rounded-[24px] border border-slate-700 shadow-sm space-y-6">
                                <h4 className="font-black text-lg text-white border-b border-slate-700 pb-3">الشريط الإخباري العلوي (Marquee)</h4>
                                <div className="space-y-3">
                                    {(settings.marqueeText || []).map((txt, i) => (
                                        <div key={i} className="flex gap-2">
                                            <input type="text" value={txt} onChange={(e) => { const newArr = [...settings.marqueeText]; newArr[i] = e.target.value; setSettings({...settings, marqueeText: newArr}); }} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 text-sm" />
                                            <button onClick={() => { const newArr = settings.marqueeText.filter((_, idx) => idx !== i); setSettings({...settings, marqueeText: newArr}); }} className="bg-red-500/10 text-red-400 px-4 rounded-xl hover:bg-red-500 hover:text-white transition"><Trash size={16}/></button>
                                        </div>
                                    ))}
                                    <button onClick={() => setSettings({...settings, marqueeText: [...(settings.marqueeText || []), 'رسالة جديدة...']})} className="text-sm font-bold text-pink-400 bg-pink-500/10 px-4 py-2 rounded-xl hover:bg-pink-500 hover:text-white transition flex items-center gap-2"><Plus size={16}/> إضافة جملة للشريط</button>
                                </div>
                            </div>

                            <div className="bg-slate-800 p-6 md:p-8 rounded-[24px] border border-slate-700 shadow-sm space-y-6">
                                <h4 className="font-black text-lg text-white border-b border-slate-700 pb-3">القائمة الجانبية للعميل</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div><label className="text-xs font-bold block mb-2 text-slate-400">العنوان الرئيسي</label><input type="text" value={settings.sidebarPromoTitle || ''} onChange={e => setSettings({...settings, sidebarPromoTitle: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 text-sm" /></div>
                                    <div><label className="text-xs font-bold block mb-2 text-slate-400">الوصف الفرعي</label><input type="text" value={settings.sidebarPromoSub || ''} onChange={e => setSettings({...settings, sidebarPromoSub: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 text-sm" /></div>
                                    <div className="md:col-span-2"><label className="text-xs font-bold block mb-2 text-slate-400">مواعيد العمل (تظهر للعملاء)</label><input type="text" value={settings.storeHours || ''} onChange={e => setSettings({...settings, storeHours: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 text-sm" /></div>
                                </div>
                            </div>

                            <div className="bg-slate-800 p-6 md:p-8 rounded-[24px] border border-slate-700 shadow-sm space-y-6">
                                <h4 className="font-black text-lg text-white border-b border-slate-700 pb-3">الفوتر (أسفل الموقع)</h4>
                                <div>
                                    <label className="text-xs font-bold block mb-2 text-slate-400">من نحن (النص التعريفي لـ حلويات بوسي)</label>
                                    <textarea value={settings.footerAbout || ''} onChange={e => setSettings({...settings, footerAbout: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 text-sm h-24 resize-none"></textarea>
                                </div>
                            </div>

                            <button onClick={() => {syncStoreToDb('settings', settings); showToast('تم حفظ الهيكل العام وتحديث واجهة العملاء بنجاح');}} className="w-full bg-pink-600 text-white py-4 rounded-xl font-bold hover:bg-pink-500 transition shadow-lg shadow-pink-600/20 text-lg">حفظ كافة التعديلات الهيكلية</button>
                        </div>
                    )}

                    {activeAdminTab === 'products' && (
                        <div className="animate-fadeIn">
                            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                                <button onClick={() => openAdminModal('product', 'add')} className="bg-pink-600 text-white px-6 md:px-8 py-3 md:py-3.5 rounded-[16px] md:rounded-[20px] font-bold text-sm md:text-lg flex items-center justify-center gap-2 hover:bg-pink-500 transition shadow-lg shadow-pink-600/20"><Plus size={20}/> إضافة منتج وتكوين أحجامه</button>
                                <input type="text" placeholder="بحث في منتجات حلويات بوسي..." value={adminSearchQuery} onChange={e=>setAdminSearchQuery(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-[16px] md:rounded-[20px] px-6 py-3 md:py-3.5 outline-none text-white focus:border-pink-500 shadow-sm" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                {filteredAdminProducts.map(p => (
                                    <div key={p.id} className="bg-slate-800 p-4 md:p-5 rounded-[20px] md:rounded-[24px] border border-slate-700 flex flex-col hover:border-pink-500/50 transition shadow-sm group">
                                        <div className="flex gap-4 mb-4">
                                            <img src={p.img} className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover border border-slate-600 shrink-0 group-hover:scale-105 transition" alt=""/>
                                            <div className="flex-1 pt-1">
                                                <h4 className="font-bold text-white text-sm mb-1 leading-tight">{p.name}</h4>
                                                <span className="bg-slate-900 text-slate-300 border border-slate-700 text-[10px] px-2 py-0.5 rounded-lg inline-block mb-1">{p.category || 'عام'}</span>
                                                <div className="text-[10px] text-pink-400 font-bold">{p.options && p.options.length > 0 ? `متعدد الأحجام (${p.options.length})` : `نكهات مباشرة (${p.flavors?.length || 0})`}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 mt-auto border-t border-slate-700/50 pt-4"><button onClick={() => openAdminModal('product', 'edit', p)} className="flex-1 bg-slate-700 text-xs font-bold text-slate-300 py-2.5 rounded-lg hover:text-white transition border border-transparent hover:border-slate-500">تعديل التكوين</button><button onClick={() => deleteProduct(p.id)} className="bg-red-500/10 text-red-400 px-4 py-2.5 rounded-lg hover:bg-red-50 hover:text-white transition"><Trash size={16}/></button></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeAdminTab === 'categories' && (
                        <div className="animate-fadeIn">
                            <button onClick={() => openAdminModal('category', 'add')} className="mb-6 bg-pink-600 text-white px-6 md:px-8 py-3 md:py-3.5 rounded-[16px] md:rounded-[20px] font-bold text-sm md:text-lg flex items-center justify-center w-full md:w-auto gap-2 hover:bg-pink-500 transition shadow-lg shadow-pink-600/20"><Plus size={20}/> إضافة قسم للواجهة</button>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                                {filteredAdminCategories.map(cat => (
                                    <div key={cat.id} className="bg-slate-800 p-4 md:p-5 rounded-[20px] md:rounded-[24px] shadow-sm border border-slate-700 flex flex-col group hover:border-pink-500/50 transition">
                                        <div className="flex items-center gap-4 mb-4">
                                            {cat.img ? <img src={cat.img} className="w-14 h-14 md:w-16 md:h-16 rounded-2xl object-cover border border-slate-600 group-hover:scale-105 transition" alt=""/> : <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-500"><Grid size={24}/></div>}
                                            <div className="flex-1"><h4 className="font-bold text-base md:text-lg text-white group-hover:text-pink-400 transition-colors">{cat.name}</h4></div>
                                        </div>
                                        <div className="flex gap-2 mt-auto pt-4 border-t border-slate-700/50">
                                            <button onClick={() => openAdminModal('category', 'edit', cat)} className="flex-1 bg-slate-700/50 text-slate-300 py-2.5 rounded-xl text-[10px] md:text-xs font-bold hover:bg-slate-700 hover:text-white transition">تعديل</button>
                                            <button onClick={() => deleteCategory(cat.id)} className="w-10 md:w-14 bg-red-500/10 text-red-400 py-2.5 rounded-xl flex justify-center hover:bg-red-50 hover:text-white transition"><Trash size={16}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeAdminTab === 'settings' && (
                        <div className="max-w-2xl space-y-6 animate-fadeIn">
                            <div className="bg-slate-800 p-6 md:p-8 rounded-[24px] md:rounded-[30px] border border-slate-700 shadow-sm">
                                <h3 className="font-black text-xl mb-6 text-white border-b border-slate-700 pb-4">إعدادات حلويات بوسي العامة</h3>
                                <div className="space-y-4">
                                    <div><label className="text-xs font-bold block mb-2 text-slate-400">اسم الموقع (لا ينصح بتغييره للحفاظ على الهوية)</label><input type="text" value={settings.siteTitle} onChange={e => setSettings({...settings, siteTitle: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 outline-none text-white focus:border-pink-500 text-sm shadow-inner" /></div>
                                    <div><label className="text-xs font-bold block mb-2 text-slate-400">هاتف المتجر (لاستقبال طلبات الواتساب)</label><input type="text" value={settings.phone} onChange={e => setSettings({...settings, phone: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 outline-none text-white focus:border-pink-500 text-sm shadow-inner" dir="ltr"/></div>
                                    <div><label className="text-xs font-bold block mb-2 text-slate-400">رسوم التوصيل (لإضافتها على سلة العميل)</label><input type="number" value={settings.shippingCost || 0} onChange={e => setSettings({...settings, shippingCost: Number(e.target.value)})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 outline-none text-white focus:border-pink-500 text-sm shadow-inner" /></div>
                                    
                                    <div className="grid grid-cols-2 gap-4 mt-4">
                                        <div><label className="text-xs font-bold block mb-2 text-slate-400">رابط فيسبوك</label><input type="text" value={settings.facebook || ''} onChange={e => setSettings({...settings, facebook: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-blue-500 text-xs" dir="ltr"/></div>
                                        <div><label className="text-xs font-bold block mb-2 text-slate-400">رابط انستجرام</label><input type="text" value={settings.instagram || ''} onChange={e => setSettings({...settings, instagram: e.target.value})} className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 outline-none text-white focus:border-pink-500 text-xs" dir="ltr"/></div>
                                    </div>

                                    <button onClick={() => {syncStoreToDb('settings', settings); showToast('تم حفظ الإعدادات لـ حلويات بوسي سحابياً');}} className="w-full bg-slate-700 text-white py-4 rounded-xl font-bold mt-2 hover:bg-slate-600 transition shadow-sm">حفظ البيانات الأساسية</button>
                                </div>
                            </div>
                            
                            <div className="bg-slate-800 p-6 md:p-8 rounded-[24px] md:rounded-[30px] border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.05)]">
                                <h3 className="font-black text-xl mb-6 text-red-400 flex items-center gap-2 border-b border-slate-700 pb-4"><Shield size={24}/> الأمان وكلمة المرور</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold block mb-2 text-slate-400">تغيير كلمة المرور للإدارة</label>
                                        <input type="text" value={newPasswordInput} onChange={e => setNewPasswordInput(e.target.value)} className="w-full bg-slate-900 border border-red-500/30 text-white rounded-xl p-4 outline-none focus:border-red-500 text-center font-bold tracking-widest transition shadow-inner" placeholder="أدخل كلمة مرور جديدة لـ حلويات بوسي" />
                                        <p className="text-[10px] text-slate-500 mt-2 font-bold text-center">كلمة المرور سيتم تشفيرها وحفظها سحابياً لمنع أي اختراق لبيانات حلويات بوسي.</p>
                                    </div>
                                    <button onClick={saveNewPassword} className="w-full bg-red-500 text-white py-4 rounded-xl font-bold mt-2 hover:bg-red-600 transition shadow-lg shadow-red-500/20">تأكيد التحديث الأمني</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>
            
            {adminModalConfig.isOpen && adminModalConfig.type === 'homepage_section' && <SectionMetaModal />}
            {adminModalConfig.isOpen && adminModalConfig.type === 'category' && <CategoryModal />}
            {adminModalConfig.isOpen && adminModalConfig.type === 'product' && <ProductModal />}
        </div>
    );
  };

  // --- 3. PUBLIC FRONTEND VIEW ---
  const renderPublicView = () => {

    const renderDynamicSection = (sec) => {
        if (!sec.isVisible) return null;

        switch (sec.id.split('_')[0] + '_' + sec.id.split('_')[1]) {
            case 'sec_hero':
                return (
                    <section key={sec.id} className="pt-8 pb-8 px-6 bg-white flex flex-col items-center">
                        <h2 className="text-[32px] font-light leading-tight mb-4 text-gray-800 tracking-tight text-center">
                            <SafeHighlight text={sec.heading} highlight="التميز" color={pink.vibrant} />
                        </h2>
                        <p className="text-gray-400 text-[13px] max-w-[300px] text-center mb-10 leading-relaxed font-black">{sec.desc}</p>
                        <div className="flex justify-center mb-10 w-full"><button onClick={() => navigate('all-products')} className="text-white px-14 py-4 rounded-full font-black text-lg shadow-xl hover:scale-105 active:scale-95 transition-transform" style={{ backgroundColor: pink.vibrant }}>اطلب الآن</button></div>
                        <div className="grid grid-cols-2 gap-2.5 h-[320px] overflow-hidden relative w-full" style={{ maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)' }}>
                            <div className="flex flex-col gap-2.5 animate-waterfall-up">{(sec.images || []).slice(0, Math.max(4, Math.ceil((sec.images||[]).length/2))).map((img, i) => <img key={i} src={img} className="h-48 w-full object-cover rounded-[30px] border border-pink-50 shadow-sm" alt=""/>)}</div>
                            <div className="flex flex-col gap-2.5 animate-waterfall-down">{(sec.images || []).slice(Math.max(4, Math.ceil((sec.images||[]).length/2))).map((img, i) => <img key={i} src={img} className="h-48 w-full object-cover rounded-[30px] border border-pink-50 shadow-sm" alt=""/>)}</div>
                        </div>
                    </section>
                );
            case 'sec_arrivals':
                const arrivalProducts = appProducts.filter(p => (sec.selectedProducts || newArrivalsPool).includes(p.id));
                if (arrivalProducts.length === 0) return null;
                return (
                    <section key={sec.id} className="py-24 relative overflow-hidden bg-white border-y border-pink-50">
                        <div className="px-6 mb-16 relative z-10 flex flex-col items-center justify-center">
                            <div className="inline-flex items-center justify-center gap-3 mb-4"><div className="bg-pink-600 text-white p-2 rounded-xl shadow-lg"><Sparkles size={20} className="animate-pulse" /></div><span className="text-[12px] font-black tracking-[0.4em] uppercase text-pink-500">Exquisite Innovations</span></div>
                            <h3 className="text-[44px] md:text-[52px] font-black tracking-tighter leading-tight mb-4 text-center" style={{ color: pink.deep }}>{sec.heading}</h3>
                            <p className="text-gray-400 text-[15px] font-bold max-w-2xl text-center leading-8">{sec.desc}</p>
                        </div>
                        <div className="flex gap-8 overflow-x-auto hide-scroll px-8 pb-14 relative z-10 snap-x snap-mandatory">
                            {arrivalProducts.map((product, i) => (
                            <div key={i} className="flex-none w-[300px] bg-white rounded-[50px] overflow-hidden shadow-2xl border border-pink-50 transform transition duration-500 hover:-translate-y-4 snap-center cursor-pointer group relative">
                                <div className="h-[320px] relative overflow-hidden" onClick={() => navigate('product-detail', product)}>
                                    <img loading="lazy" src={product.img} className="w-full h-full object-cover transition-transform duration-[5s] group-hover:scale-110" alt=""/>
                                    <div className="absolute top-5 left-5 bg-white/95 backdrop-blur px-5 py-2 rounded-full shadow-xl border border-pink-50 flex items-center gap-2"><Zap size={14} className="text-yellow-500 fill-yellow-500 animate-bounce" /><span className="text-[10px] font-black text-gray-800 uppercase">متاح الآن</span></div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); openQuickView(product); }} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-pink-600 px-6 py-2 rounded-full font-black text-sm shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-pink-600 hover:text-white z-20 hover:scale-105">نظرة سريعة</button>
                                
                                <div className="p-8 text-right bg-white" onClick={() => navigate('product-detail', product)}>
                                    <div className="flex items-center justify-end gap-2 mb-3"><span className="text-[10px] font-black text-pink-500 uppercase tracking-widest">{product.category}</span><div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div></div>
                                    <h4 className="text-[22px] font-black text-gray-900 mb-2 leading-tight group-hover:text-pink-600 transition-colors">{product.name}</h4>
                                    <p className="text-[12px] text-gray-400 font-bold mb-8 leading-6 line-clamp-2">{product.shortDesc || product.desc}</p>
                                    <div className="flex items-center justify-between border-t border-gray-50 pt-6">
                                        <div className="flex flex-col text-right"><span className="text-[9px] text-gray-300 font-bold uppercase">Limited Quantity</span><span className="text-pink-600 font-black text-[13px]">اطلبها الآن</span></div>
                                        <div className="bg-pink-50 text-pink-600 p-2.5 rounded-full group-hover:bg-pink-600 group-hover:text-white transition-all duration-500"><ChevronLeft size={18} /></div>
                                    </div>
                                </div>
                            </div>
                            ))}
                        </div>
                    </section>
                );
            case 'sec_categories':
                if (appCategories.length === 0) return null;
                return (
                    <section key={sec.id} className="py-24 bg-white border-t border-gray-50 flex flex-col items-center">
                        <div className="px-6 mb-16 flex flex-col items-center justify-center text-center">
                            <div className="inline-flex items-center justify-center gap-3 mb-4"><div className="bg-pink-100 text-pink-600 p-2.5 rounded-xl shadow-sm"><Filter size={20} /></div><span className="text-[12px] font-black tracking-[0.4em] uppercase text-pink-500">Our Collections</span></div>
                            <h3 className="text-[44px] md:text-[52px] font-black tracking-tighter leading-tight mb-4" style={{ color: pink.deep }}>{sec.heading}</h3>
                            <p className="text-gray-400 text-[15px] font-bold max-w-2xl leading-8">{sec.desc}</p>
                        </div>
                        <div className="w-full flex gap-6 overflow-x-auto hide-scroll px-8 pb-16 relative z-10 snap-x snap-mandatory justify-start md:justify-center">
                        {appCategories.map((item, idx) => (
                            <div key={idx} onClick={() => navigate('all-products', null, item.name)} className="flex-none w-[280px] md:w-[300px] h-[420px] rounded-[45px] overflow-hidden shadow-lg snap-center cursor-pointer group relative transform transition-all duration-500 hover:-translate-y-4 hover:shadow-2xl border-4 border-transparent hover:border-pink-50">
                            <img src={item.img} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[10s] group-hover:scale-110" alt={item.name} />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-black/20 to-transparent opacity-90 transition-opacity duration-500"></div>
                            <div className="absolute top-6 right-6 w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white border border-white/30 shadow-lg">{item.icon || <Award size={20}/>}</div>
                            <div className="absolute bottom-0 left-0 w-full p-8 flex flex-col justify-end text-right"><h4 className="text-[26px] font-black text-white mb-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">{item.name}</h4><div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-4 group-hover:translate-y-0"><span className="text-[13px] text-pink-300 font-bold uppercase tracking-wider">استكشف التشكيلة في حلويات بوسي</span><div className="bg-pink-500 text-white p-2 rounded-full"><ChevronLeft size={16} /></div></div></div>
                            </div>
                        ))}
                        </div>
                    </section>
                );
            case 'sec_products':
                const gridProducts = appProducts.filter(p => (sec.selectedProducts || []).includes(p.id));
                if (gridProducts.length === 0) return null;
                return (
                    <section key={sec.id} className="py-12 px-4 text-center border-t border-gray-50 bg-white">
                        <h3 className="text-[28px] font-bold mb-8 tracking-tight text-center" style={{ color: pink.vibrant }}>{sec.heading}</h3>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-8">{gridProducts.slice(0, 8).map(p => <ProductCard key={p.id} p={p} onNavigate={navigate} onQuickView={openQuickView} />)}</div>
                        <button onClick={() => navigate('all-products')} className="mt-12 text-[14px] font-bold border-b-2 pb-1.5 text-center w-full hover:text-pink-700 transition-colors" style={{ borderColor: pink.brand, color: pink.vibrant }}>عرض منيو حلويات بوسي بالكامل</button>
                    </section>
                );
            
            case 'sec_giftcards':
                return (
                    <section key={sec.id} className="py-28 md:py-40 lg:py-48 px-4 md:px-6 relative overflow-hidden bg-gradient-to-b from-[#FFF9FA] to-white border-y border-pink-100 flex items-center min-h-[100vh] lg:min-h-[850px]">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diamond-upholstery.png')] opacity-30 z-0"></div>
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-pink-300 rounded-full blur-[150px] opacity-30 -translate-y-1/4 translate-x-1/4 z-0"></div>
                        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-yellow-300 rounded-full blur-[150px] opacity-20 translate-y-1/4 -translate-x-1/4 z-0"></div>

                        <div className="max-w-7xl w-full mx-auto flex flex-col lg:flex-row items-center justify-between gap-24 lg:gap-16 relative z-10">
                            <div className="text-center lg:text-right flex-1 w-full flex flex-col items-center lg:items-start z-20 mb-8 lg:mb-0">
                                <div className="inline-flex items-center justify-center gap-3 mb-8 bg-pink-50 border border-pink-100 px-6 py-3 rounded-full shadow-sm transform hover:scale-105 transition-transform">
                                    <Crown size={20} className="text-pink-500" />
                                    <span className="text-[12px] font-black tracking-[0.5em] uppercase text-pink-600">Exclusive VIP</span>
                                </div>
                                <h3 className="text-[40px] sm:text-[50px] md:text-[70px] font-black tracking-tighter leading-[1.1] mb-8 text-[#AD1457] drop-shadow-sm px-2">
                                    {sec.heading}
                                </h3>
                                <p className="text-gray-600 text-[16px] sm:text-[18px] md:text-[22px] font-bold leading-loose mb-14 max-w-2xl mx-auto lg:ml-auto lg:mr-0 border-r-0 lg:border-r-4 border-pink-400 lg:pr-6 px-4 lg:px-0">
                                    {sec.desc}
                                </p>
                                <button 
                                    onClick={() => navigate('gift-cards')}
                                    className="bg-gradient-to-l from-pink-600 to-pink-500 text-white px-10 sm:px-14 py-5 sm:py-6 rounded-full font-black text-xl sm:text-2xl shadow-[0_20px_40px_rgba(216,27,96,0.3)] hover:shadow-[0_25px_50px_rgba(216,27,96,0.4)] hover:-translate-y-2 active:scale-95 transition-all duration-300 flex items-center justify-center gap-4 sm:gap-5 mx-auto lg:mr-auto lg:ml-0 border border-pink-400 group w-[90%] sm:w-auto"
                                >
                                    اكتشف بطاقات حلويات بوسي الملكية <ArrowLeft size={28} className="group-hover:-translate-x-3 transition-transform duration-300" />
                                </button>
                            </div>
                            
                            <div className="flex-1 w-full relative h-[450px] sm:h-[550px] md:h-[600px] perspective-[1200px] flex items-center justify-center z-20">
                                <div className="relative w-full h-full animate-[float_6s_ease-in-out_infinite] flex items-center justify-center scale-95 sm:scale-100 lg:scale-110" style={{ willChange: 'transform' }}>
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-[160px] sm:translate-y-[200px] w-64 sm:w-80 h-10 sm:h-14 bg-pink-900/15 blur-3xl rounded-full z-0"></div>

                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[240px] sm:w-[280px] h-[150px] sm:h-[180px] bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 rounded-3xl shadow-[0_15px_35px_rgba(251,191,36,0.3)] transform rotate-12 rotate-y-12 rotate-x-12 opacity-80 border border-yellow-200 z-10 transition-transform duration-700 hover:rotate-6 hover:scale-105" style={{ willChange: 'transform' }}></div>
                                    
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] sm:w-[300px] h-[170px] sm:h-[190px] bg-gradient-to-br from-pink-400 via-pink-500 to-pink-700 rounded-3xl shadow-[0_20px_40px_rgba(236,72,153,0.3)] transform -rotate-6 rotate-y-6 -rotate-x-6 opacity-90 border border-pink-300 z-20 transition-transform duration-700 hover:-rotate-3 hover:scale-105" style={{ willChange: 'transform' }}></div>
                                    
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[360px] h-[200px] sm:h-[230px] bg-gradient-to-br from-white via-pink-50 to-[#FFF0F3] rounded-[35px] sm:rounded-[40px] shadow-[0_30px_70px_rgba(216,27,96,0.25)] border-2 border-white transform transition-all duration-1000 hover:scale-110 hover:rotate-0 flex flex-col justify-between p-8 sm:p-10 overflow-hidden group cursor-pointer z-30" style={{ willChange: 'transform' }} onClick={() => navigate('gift-cards')}>
                                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-80 skew-x-[-30deg] -translate-x-full group-hover:animate-[shimmer_2s_infinite]"></div>
                                        <div className="flex justify-between items-start relative z-10">
                                            <Crown size={40} className="text-pink-600 drop-shadow-md w-9 h-9 sm:w-12 sm:h-12" />
                                            <span className="text-[#AD1457] font-black text-2xl sm:text-3xl tracking-tighter drop-shadow-sm">{settings.siteTitle}</span>
                                        </div>
                                        <div className="text-right relative z-10 mt-auto">
                                            <span className="text-pink-600 font-black text-4xl sm:text-5xl md:text-6xl tracking-tighter block mb-2 drop-shadow-md leading-none">EGP 1000</span>
                                            <span className="text-gray-500 text-[10px] sm:text-[12px] font-black tracking-[0.4em] sm:tracking-[0.5em] uppercase">Premium Gift Card</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                );

            case 'sec_legacy':
                return (
                    <section id="sec_legacy" key={sec.id} className="py-20 px-8 text-center bg-white border-t border-gray-50">
                        <h3 className="text-[28px] font-black mb-6 tracking-tight text-center" style={{ color: pink.vibrant }}>{sec.heading}</h3>
                        <p className="text-gray-500 text-[14px] leading-8 mb-12 font-bold max-w-xl mx-auto text-center">{sec.desc}</p>
                        <div className="relative w-full h-[350px] rounded-[50px] overflow-hidden mx-auto max-w-md shadow-2xl border-[6px] border-white bg-gray-50">{ (sec.images || legacyImages).map((src, i) => (<img key={i} src={src} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === legacyIndex ? 'opacity-100' : 'opacity-0'}`} alt="" />))}</div>
                    </section>
                );
            case 'sec_stats':
                return (
                    <section key={sec.id} className="py-16 px-8 text-center bg-pink-50/20 border-t border-gray-50">
                        <div className="max-w-xl mx-auto flex flex-col items-center">
                            <Award size={32} style={{ color: pink.vibrant }} className="mb-4" />
                            <h3 className="text-[30px] font-black mb-8 tracking-tight" style={{ color: pink.vibrant }}>{sec.heading}</h3>
                            <p className="text-gray-600 text-[15px] leading-8 mb-10 font-bold">{sec.desc}</p>
                            <div className="grid grid-cols-3 gap-4 w-full">
                                <div className="bg-white p-4 rounded-3xl shadow-sm"><span className="block text-2xl font-black text-pink-600">+5000</span><span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">عميل سعيد</span></div>
                                <div className="bg-white p-4 rounded-3xl shadow-sm"><span className="block text-2xl font-black text-pink-600">+10</span><span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">سنوات خبرة</span></div>
                                <div className="bg-white p-4 rounded-3xl shadow-sm"><span className="block text-2xl font-black text-pink-600">100%</span><span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">جودة أصيلة</span></div>
                            </div>
                        </div>
                    </section>
                );
            case 'sec_bestsellers':
                const bestsellerProducts = appProducts.filter(p => (sec.selectedProducts || superstarCandidates).includes(p.id));
                if (bestsellerProducts.length === 0) return null;
                return (
                    <section key={sec.id} className="py-24 relative overflow-hidden bg-white border-t border-gray-50">
                        <div className="px-6 mb-16 relative z-10 flex flex-col items-center justify-center">
                            <div className="inline-flex items-center justify-center gap-3 mb-4"><div className="bg-yellow-100 text-yellow-600 p-2 rounded-xl shadow-sm"><Trophy size={20} className="animate-bounce" /></div><span className="text-[12px] font-black tracking-[0.4em] uppercase text-yellow-600">Elite Weekly Selection</span></div>
                            <h3 className="text-[44px] md:text-[52px] font-black tracking-tighter leading-tight mb-4" style={{ color: pink.deep }}>{sec.heading}</h3>
                            <p className="text-gray-400 text-[15px] font-bold max-w-2xl text-center leading-8">{sec.desc}</p>
                        </div>
                        <div className="flex gap-10 overflow-x-auto hide-scroll px-8 pb-14 relative z-10 snap-x snap-mandatory">
                        {bestsellerProducts.map((product, i) => (
                            <div key={i} className="flex-none w-[320px] bg-white rounded-[55px] shadow-2xl border border-gray-100 overflow-hidden snap-center transform transition duration-500 hover:-translate-y-4 cursor-pointer group relative">
                                <div className="absolute top-6 right-6 z-20 bg-white/95 backdrop-blur shadow px-5 py-2.5 rounded-2xl flex items-center gap-2 border border-pink-50"><TrendingUp size={16} className="text-pink-500" /><span className="text-[11px] font-black text-gray-800 uppercase">متميز</span></div>
                                <div className="h-[360px] relative overflow-hidden" onClick={() => navigate('product-detail', product)}>
                                    <img loading="lazy" src={product.img} className="w-full h-full object-cover group-hover:scale-110 transition duration-[4s]" alt=""/>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                                    <div className="absolute bottom-6 right-8 text-white text-right"><h4 className="text-[26px] font-black">{product.name}</h4></div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); openQuickView(product); }} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-pink-600 px-6 py-2 rounded-full font-black text-sm shadow-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-pink-600 hover:text-white z-20 hover:scale-105">نظرة سريعة</button>
                                
                                <div className="p-8 text-right bg-white" onClick={() => navigate('product-detail', product)}>
                                    <div className="flex items-center justify-between mb-6"><div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-600 rounded-full text-[10px] font-black"><ShieldCheck size={12}/> جودة ملكية من حلويات بوسي</div></div>
                                    <div className="flex items-center justify-between pt-6 border-t border-gray-50 group-hover:border-pink-100 transition-all">
                                        <span className="text-pink-600 font-black text-[14px]">اكتشف المذاق</span>
                                        <div className="w-14 h-14 rounded-full flex items-center justify-center bg-gray-50 group-hover:bg-pink-600 group-hover:text-white transition-all"><ChevronLeft size={24} /></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        </div>
                    </section>
                );
            case 'sec_roses':
                return (
                    <section key={sec.id} className="px-6 py-24 bg-white border-t border-gray-50 text-right">
                        <div className="relative overflow-hidden rounded-[65px] p-12 md:p-20 text-white shadow-3xl min-h-[600px] flex flex-col justify-center items-end" style={{ background: `linear-gradient(135deg, ${pink.vibrant} 0%, ${pink.deep} 100%)` }}>
                            <div className="absolute top-0 right-0 opacity-10 -translate-y-1/4 translate-x-1/4"><Flower size={500} strokeWidth={0.5} /></div>
                            <div className="relative z-10 max-w-2xl text-right">
                                <div className="flex items-center justify-end gap-4 mb-8 text-right"><div className="h-px w-16 bg-white/40"></div><span className="text-[12px] font-black tracking-[0.4em] uppercase text-pink-100">Pure Nature Exclusive</span></div>
                                <h3 className="text-[52px] md:text-[64px] font-black mb-8 leading-[1.1] tracking-tighter">
                                    <SafeHighlight text={sec.heading} highlight="الطبيعة" color="#FBCFE8" />
                                </h3>
                                <p className="text-[18px] md:text-[22px] opacity-90 mb-12 leading-relaxed font-bold border-r-8 border-white/20 pr-6">{sec.desc}</p>
                                <button onClick={() => navigate('all-products', null, 'roses')} className="bg-white text-pink-600 px-16 py-6 rounded-full font-black text-2xl shadow-2xl transition transform hover:scale-105 active:scale-95 flex items-center gap-4 group">اكتشف انفرادنا في حلويات بوسي <ChevronLeft size={28} className="group-hover:-translate-x-2 transition-transform" /></button>
                            </div>
                        </div>
                    </section>
                );
            default: return null;
        }
    };

    return (
        <div className="min-h-screen bg-white text-gray-800 font-light overflow-x-hidden leading-snug" dir="rtl">
            {/* TOP MARQUEE (DYNAMIC NOW) */}
            {settings.marqueeText && settings.marqueeText.length > 0 && (
                <div className="relative overflow-hidden whitespace-nowrap py-1.5 z-[60]" style={{ backgroundColor: pink.vibrant }}>
                    <div className="flex items-center animate-marquee-seamless">
                        {[...Array(4)].map((_, idx) => (
                            <span key={idx} className="text-white text-[11px] font-black px-8 uppercase inline-block">
                                {settings.marqueeText.join(' - ')}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* 🌟 ENHANCED STICKY HEADER 🌟 */}
            <header className={`sticky top-0 z-50 transition-all duration-500 ${isScrolled ? 'bg-white/90 backdrop-blur-xl shadow-[0_10px_30px_rgba(216,27,96,0.05)] border-b border-pink-100 py-2 md:py-3' : 'bg-white/95 backdrop-blur-md border-b border-pink-50 py-3 md:py-4'} px-4 md:px-8 flex justify-between items-center`}>
                <div className="flex items-center gap-4 flex-1 justify-start">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 lg:hidden text-gray-600 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-colors cursor-pointer text-right">
                        <Menu size={26} />
                    </button>
                    <nav className="hidden lg:flex items-center gap-6 text-[13px] font-black text-gray-500 tracking-wide pr-2">
                        <button onClick={() => navigate('home')} className="hover:text-pink-600 transition-colors">الرئيسية</button>
                        <button onClick={() => navigate('all-products')} className="hover:text-pink-600 transition-colors">المنيو الملكي لـ حلويات بوسي</button>
                        <button onClick={() => { if(currentPage!=='home') navigate('home'); setTimeout(()=>document.getElementById('sec_legacy')?.scrollIntoView({behavior: 'smooth'}), 100) }} className="hover:text-pink-600 transition-colors">قصتنا</button>
                    </nav>
                </div>

                <div className="text-center cursor-pointer flex flex-col items-center justify-center flex-1 group transform transition-transform hover:scale-105" onClick={() => navigate('home')}>
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-pink-400 hidden md:block opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tighter drop-shadow-sm">{settings.siteTitle}</h1>
                        <Sparkles size={16} className="text-pink-400 hidden md:block opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.5em] md:tracking-[0.6em] mt-0.5 transition-colors" style={{ color: pink.vibrant }}>
                        BOSE SWEETS & ROSES
                    </p>
                </div>

                <div className="flex items-center justify-end gap-1 md:gap-3 flex-1 text-left" dir="ltr">
                    <button className="hidden sm:flex p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all cursor-pointer"><Search size={20} /></button>
                    <button className="hidden md:flex p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all cursor-pointer"><Heart size={20} /></button>
                    <button className="hidden lg:flex p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all relative cursor-pointer">
                        <Bell size={20} />
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pink-500 rounded-full animate-pulse border border-white"></span>
                    </button>
                    
                    <div className="relative cursor-pointer p-2 md:p-3 text-gray-700 hover:text-pink-600 hover:bg-pink-50 rounded-full transition-all group" onClick={() => setIsCartOpen(true)} dir="rtl">
                        <ShoppingBag size={22} className="group-hover:scale-110 transition-transform" />
                        <span className="absolute top-1 right-1 md:top-1.5 md:right-1.5 text-white text-[9px] rounded-full w-4 h-4 md:w-5 md:h-5 flex items-center justify-center font-black border-2 border-white shadow-sm bg-pink-500 group-hover:bg-pink-600 transition-colors">
                            {cartItemsCount}
                        </span>
                    </div>
                </div>
            </header>

            {/* MAIN CONTENT ROUTING */}
            {currentPage === 'home' && (
                <main className="animate-fadeIn text-right">
                    {appSections.map(sec => renderDynamicSection(sec))}
                </main>
            )}

            {currentPage === 'gift-cards' && (
                <GiftCardsPage 
                    onBack={() => navigate('home')} 
                    onAddToCart={addToCart} 
                    pink={pink} 
                    siteTitle={settings.siteTitle} 
                />
            )}

            {currentPage === 'all-products' && (
                <div className="py-16 px-6 animate-fadeIn bg-white min-h-screen">
                    <button onClick={() => navigate('home')} className="font-bold mb-10 flex items-center justify-end gap-2 text-lg text-gray-400 hover:text-pink-600 transition-all text-right w-full justify-end">العودة للرئيسية <ArrowLeft size={28} /></button>
                    <div className="flex flex-col mb-12 border-r-[10px] pr-6 text-right" style={{ borderColor: pink.vibrant }}><h2 className="text-[32px] font-black mb-2 text-right w-full text-right" style={{ color: pink.deep }}>المنيو الكامل لـ حلويات بوسي</h2><p className="text-[14px] text-gray-400 font-bold text-right w-full tracking-tight">جميع الأصناف المفلترة حسب اختيارك</p></div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">{filteredAllProducts.map(p => <ProductCard key={p.id} p={p} onNavigate={navigate} onQuickView={openQuickView} />)}</div>
                </div>
            )}

            {currentPage === 'product-detail' && selectedProduct && (
                <div className="py-12 px-6 animate-fadeIn pb-32 max-w-5xl mx-auto text-right">
                    <button onClick={() => navigate('home')} className="font-bold mb-10 flex items-center justify-end gap-2 text-lg text-gray-400 hover:text-pink-600 transition-all w-full text-right">العودة للرئيسية <ArrowLeft size={28} /></button>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="h-[450px] rounded-[50px] overflow-hidden shadow-2xl border-4 border-white relative group">
                            <img src={selectedProduct.img} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="" />
                            <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center gap-2 shadow-lg text-pink-600 font-black text-sm">
                                <Sparkles size={16} /> مميز
                            </div>
                        </div>
                        <div className="text-right flex flex-col justify-center">
                            <div className="inline-flex items-center justify-end gap-2 mb-3">
                                <span className="bg-pink-50 text-pink-600 px-3 py-1 rounded-lg text-[11px] font-black tracking-widest">{selectedProduct.category}</span>
                            </div>
                            <h2 className="text-4xl font-black mb-4 text-gray-900 leading-tight">{selectedProduct.name}</h2>
                            <p className="text-gray-500 leading-8 mb-8 font-bold text-[15px] border-r-4 border-pink-200 pr-4">{selectedProduct.desc}</p>
                            
                            {selectedProduct.options && selectedProduct.options.length > 0 && (
                                <div className="flex bg-gray-100 p-2 rounded-[40px] w-full mb-8 shadow-inner overflow-x-auto custom-scrollbar">
                                    {selectedProduct.options.map((opt, i) => (
                                        <button key={i} onClick={() => setActiveSizeIndex(i)} className={`flex-none min-w-[80px] py-3 px-4 rounded-[35px] text-[13px] font-black transition-all ${activeSizeIndex === i ? 'bg-white shadow-lg text-pink-600' : 'text-gray-400 hover:text-gray-600'}`}>{opt.label}</button>
                                    ))}
                                </div>
                            )}

                            <div className="bg-pink-50/50 p-6 rounded-3xl border border-pink-100 mb-8">
                                <h4 className="font-black text-pink-600 mb-4 flex items-center gap-2 justify-end">النكهات المتاحة <Flame size={18}/></h4>
                                <div className="grid gap-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                                    {(selectedProduct.flavors || (selectedProduct.options?.[activeSizeIndex]?.flavors) || []).map((f, i) => {
                                        const activeLabel = selectedProduct.options?.[activeSizeIndex]?.label || '';
                                        const cartId = encodeURIComponent(`${selectedProduct.id}-${activeLabel}-${f.name.replace(/\//g, '-')}`); 
                                        const qty = quantities[cartId] || 0; 
                                        return (
                                        <div key={i} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-pink-100 shadow-sm transition hover:border-pink-300 hover:shadow-md">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center bg-gray-50 rounded-full p-1 border">
                                                    <button onClick={() => handleQtyChange(cartId, -1)} className="p-1.5 hover:text-pink-600 hover:bg-white rounded-full transition-colors cursor-pointer"><Minus size={14}/></button>
                                                    <span className="w-8 text-center font-black text-sm">{qty}</span>
                                                    <button onClick={() => handleQtyChange(cartId, 1)} className="p-1.5 hover:text-pink-600 hover:bg-white rounded-full transition-colors cursor-pointer"><Plus size={14}/></button>
                                                </div>
                                                <button onClick={() => addToCart(selectedProduct, f, activeLabel)} className={`p-2.5 rounded-xl active:scale-90 transition cursor-pointer ${qty>0 ? 'bg-pink-600 text-white shadow-lg shadow-pink-200' : 'bg-gray-100 text-gray-500 hover:bg-pink-200 hover:text-pink-600'}`} title="أضف للسلة"><Plus size={16}/></button>
                                            </div>
                                            <div className="text-right flex flex-col justify-center">
                                                <span className="font-bold block text-[15px] mb-1 text-gray-800">{f.name}</span>
                                                <span className="font-black text-pink-600 text-[13px] bg-pink-50 px-2 py-0.5 rounded-md w-fit ml-auto">{f.price} ج.م</span>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 🌟 NEW: SMART RECOMMENDATIONS SECTION 🌟 */}
                    {productRecommendations.length > 0 && (
                        <div className="mt-24 pt-16 border-t border-gray-100 relative animate-fadeIn">
                            <div className="absolute top-0 right-1/2 translate-x-1/2 -translate-y-1/2 bg-white px-8 text-center">
                                <div className="inline-flex items-center justify-center gap-2 mb-2">
                                    <Sparkles size={16} className="text-pink-400" />
                                    <span className="text-[11px] font-black tracking-widest text-pink-400 uppercase">اقتراحات ساحرة</span>
                                </div>
                                <h3 className="text-3xl font-black text-gray-800">قد يعجبك أيضاً</h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
                                {productRecommendations.map(p => <ProductCard key={p.id} p={p} onNavigate={navigate} onQuickView={openQuickView} />)}
                            </div>
                        </div>
                    )}

                    {/* 🌟 NEW: REVIEWS SECTION 🌟 */}
                    <div className="mt-24 bg-white p-8 md:p-12 rounded-[40px] shadow-sm border border-gray-100 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-pink-50 rounded-bl-[100px] -z-10"></div>
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10 border-b border-gray-100 pb-8">
                            <div className="text-right">
                                <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3 justify-end"><MessageSquare className="text-pink-500" /> آراء ضيوف حلويات بوسي</h3>
                                <p className="text-sm text-gray-500 font-bold mt-2">شاركنا تجربتك الملكية مع {selectedProduct.name}</p>
                            </div>
                            <div className="flex flex-col bg-gray-50 p-4 rounded-2xl border border-gray-100 min-w-[200px]">
                                <span className="text-xs text-gray-400 font-bold mb-2">أضف تقييمك:</span>
                                <div className="flex justify-between items-center gap-2 mb-3 cursor-pointer" dir="ltr">
                                    {[1,2,3,4,5].map(star => (
                                        <Star key={star} onClick={() => setNewReview({...newReview, rating: star})} size={24} className={`transition-all hover:scale-110 ${newReview.rating >= star ? 'fill-yellow-400 text-yellow-400 drop-shadow-sm' : 'text-gray-300'}`} />
                                    ))}
                                </div>
                                <input type="text" placeholder="الاسم الكريم" value={newReview.reviewerName} onChange={(e) => setNewReview({...newReview, reviewerName: e.target.value})} className="w-full text-xs font-bold p-2.5 rounded-lg border border-gray-200 outline-none focus:border-pink-300 mb-2 text-right" />
                                <textarea placeholder="اكتب رأيك هنا..." value={newReview.text} onChange={(e) => setNewReview({...newReview, text: e.target.value})} className="w-full text-xs font-bold p-2.5 rounded-lg border border-gray-200 outline-none focus:border-pink-300 h-16 resize-none text-right mb-2"></textarea>
                                <button onClick={submitReview} disabled={isSyncing} className="w-full bg-pink-600 text-white font-black text-xs py-2.5 rounded-lg hover:bg-pink-700 transition disabled:opacity-50">نشر التقييم</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            {reviews.filter(r => r.productId === selectedProduct.id).length === 0 ? (
                                <div className="col-span-full text-center text-gray-400 font-bold py-8">كن أول من يشاركنا رأيه في هذا المنتج الفاخر</div>
                            ) : (
                                reviews.filter(r => r.productId === selectedProduct.id).sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0)).map((rev, i) => (
                                    <div key={i} className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex text-yellow-400" dir="ltr">
                                                {[...Array(5)].map((_, idx) => <Star key={idx} size={14} className={idx < rev.rating ? "fill-current" : "text-gray-300"} />)}
                                            </div>
                                            <h5 className="font-black text-gray-800 text-sm flex items-center gap-2">{rev.reviewerName} <User size={14} className="text-pink-400"/></h5>
                                        </div>
                                        <p className="text-gray-600 text-[13px] font-bold leading-relaxed relative z-10"><Quote size={24} className="absolute -top-3 -right-2 text-pink-100 -z-10 rotate-180" /> {rev.text}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {quickViewProduct && (
                <div className="fixed inset-0 z-[800] flex justify-center items-center p-4">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={() => setQuickViewProduct(null)}></div>
                    <div className="bg-white rounded-[40px] max-w-4xl w-full max-h-[90vh] overflow-y-auto custom-scrollbar relative z-10 animate-scale-up shadow-2xl flex flex-col md:flex-row border border-pink-100" dir="rtl">
                        <button onClick={() => setQuickViewProduct(null)} className="absolute top-4 left-4 p-2 bg-white/80 hover:bg-pink-50 hover:text-pink-600 rounded-full text-gray-500 z-20 shadow-sm transition-all"><X size={24}/></button>
                        
                        <div className="w-full md:w-1/2 h-[300px] md:h-auto relative">
                            <img src={quickViewProduct.img} className="w-full h-full object-cover rounded-t-[40px] md:rounded-tr-[40px] md:rounded-tl-none" alt="" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end p-6">
                                <h2 className="text-3xl font-black text-white drop-shadow-md">{quickViewProduct.name}</h2>
                            </div>
                        </div>

                        <div className="w-full md:w-1/2 p-6 md:p-8 text-right flex flex-col">
                            <p className="text-gray-600 leading-relaxed mb-6 font-bold text-sm">{quickViewProduct.desc}</p>
                            
                            {quickViewProduct.options && quickViewProduct.options.length > 0 && (
                                <div className="flex bg-gray-100 p-1.5 rounded-full w-full mb-6 shadow-inner overflow-x-auto custom-scrollbar">
                                    {quickViewProduct.options.map((opt, i) => (
                                        <button key={i} onClick={() => setActiveSizeIndex(i)} className={`flex-none px-3 py-2.5 rounded-full text-[12px] font-black transition-all ${activeSizeIndex === i ? 'bg-white shadow-md text-pink-600' : 'text-gray-400 hover:text-gray-600'}`}>{opt.label}</button>
                                    ))}
                                </div>
                            )}

                            <div className="bg-pink-50/50 p-4 rounded-3xl flex-1 overflow-y-auto custom-scrollbar border border-pink-50">
                                <h4 className="font-black text-pink-600 mb-3 text-sm flex items-center gap-2"><Sparkles size={16}/> إضافات حلويات بوسي:</h4>
                                <div className="grid gap-2.5">
                                    {(quickViewProduct.flavors || (quickViewProduct.options?.[activeSizeIndex]?.flavors) || []).map((f, i) => {
                                        const activeLabel = quickViewProduct.options?.[activeSizeIndex]?.label || '';
                                        const cartId = encodeURIComponent(`${quickViewProduct.id}-${activeLabel}-${f.name.replace(/\//g, '-')}`); 
                                        const qty = quantities[cartId] || 0; 
                                        return (
                                        <div key={i} className="flex justify-between items-center bg-white p-3 rounded-2xl border border-pink-100 shadow-sm transition hover:border-pink-300">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center bg-gray-50 rounded-full p-0.5 border">
                                                    <button onClick={() => handleQtyChange(cartId, -1)} className="p-1 hover:text-pink-600 cursor-pointer"><Minus size={12}/></button>
                                                    <span className="w-6 text-center font-bold text-xs">{qty}</span>
                                                    <button onClick={() => handleQtyChange(cartId, 1)} className="p-1 hover:text-pink-600 cursor-pointer"><Plus size={12}/></button>
                                                </div>
                                                <button onClick={() => addToCart(quickViewProduct, f, activeLabel)} className={`p-1.5 rounded-xl active:scale-90 transition cursor-pointer ${qty>0 ? 'bg-pink-600 text-white shadow-md' : 'bg-gray-200 text-gray-400 hover:bg-pink-200 hover:text-pink-600'}`} title="أضف للسلة"><Plus size={14}/></button>
                                            </div>
                                            <div className="text-right flex flex-col items-end justify-center">
                                                <span className="font-bold text-[13px] leading-none mb-1">{f.name}</span>
                                                <span className="font-black text-pink-600 text-[10px] bg-pink-50 px-2 py-0.5 rounded-md">{f.price} ج.م</span>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                            <div className="pt-4 mt-auto">
                                <button onClick={() => { setQuickViewProduct(null); navigate('product-detail', quickViewProduct); }} className="w-full text-center text-xs font-bold text-gray-400 hover:text-pink-600 transition-colors">عرض التفاصيل الكاملة للصفحة</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 🌟 FIXED & HARDENED ADMIN LOGIN SCREEN 🌟 */}
            {currentPage === 'admin-login' && (
                <div className="min-h-[80vh] flex items-center justify-center bg-white p-6 relative z-10">
                    <div className="bg-white border-2 border-pink-100 p-10 rounded-[45px] shadow-2xl w-full max-w-sm text-center animate-fadeIn z-20 relative">
                        <div className="w-20 h-20 bg-gradient-to-br from-pink-500 to-pink-600 rounded-3xl mx-auto flex items-center justify-center text-white text-3xl font-black mb-6 shadow-lg shadow-pink-200">B</div>
                        <h2 className="text-2xl font-black text-gray-800 mb-8 tracking-tighter uppercase">بوابة إدارة حلويات بوسي</h2>
                        
                        <div className="space-y-6 relative z-30">
                            <input 
                                type="password" 
                                value={adminPinInput} 
                                onChange={e => setAdminPinInput(e.target.value)} 
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAdminLogin(e); }}
                                disabled={isLoggingIn || isAdminLocked}
                                placeholder="الرمز السري الموحد" 
                                className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-pink-500 rounded-2xl text-center font-bold text-xl outline-none transition-all disabled:opacity-50" 
                                autoFocus 
                            />
                            <button 
                                type="button"
                                onClick={handleAdminLogin} 
                                disabled={isLoggingIn || isAdminLocked}
                                className={`w-full bg-pink-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl transition-all cursor-pointer relative z-50 ${isLoggingIn || isAdminLocked ? 'opacity-70 cursor-not-allowed' : 'hover:bg-pink-700 active:scale-95'}`}>
                                {isLoggingIn ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 size={24} className="animate-spin" /> جاري التحقق الأمن...
                                    </div>
                                ) : isAdminLocked ? (
                                    `النظام مقفل (${adminLockTimer} ث)`
                                ) : (
                                    'تأكيد الدخول الآمن'
                                )}
                            </button>
                        </div>
                        
                        <button onClick={() => navigate('home')} className="mt-10 text-gray-400 font-bold text-sm hover:text-pink-600 transition-colors cursor-pointer relative z-30">العودة للمتجر الرئيسي</button>
                    </div>
                </div>
            )}

            {/* 🌟 DEVELOPED SIDEBAR (DYNAMIC) 🌟 */}
            {isSidebarOpen && (
                <div className="fixed inset-0 z-[500] flex text-right" dir="rtl">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-500" onClick={() => setIsSidebarOpen(false)}></div>
                    <div className="relative w-full max-w-[340px] bg-white h-full shadow-2xl flex flex-col animate-slide overflow-hidden">
                        
                        <div className="p-6 pb-4 border-b border-pink-50 flex justify-between items-center bg-white z-10 relative">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-pink-200">
                                    <Crown size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tighter">{settings.siteTitle}</h2>
                                    <p className="text-[10px] text-pink-500 font-bold uppercase tracking-widest mt-1">Bose Sweets Experience</p>
                                </div>
                            </div>
                            <button onClick={() => setIsSidebarOpen(false)} className="p-2.5 bg-gray-50 hover:bg-pink-50 hover:text-pink-600 rounded-full text-gray-400 transition-all cursor-pointer"><X size={20}/></button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-2 z-10 relative">
                            
                            <div className="mb-6 p-5 rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 text-white shadow-xl relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                                <div className="relative z-10 flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest">بطاقة العميل الملكية</span>
                                    <Sparkles size={14} className="text-yellow-400" />
                                </div>
                                <h3 className="text-lg font-black mb-1">{settings.sidebarPromoTitle}</h3>
                                <p className="text-xs text-gray-400 font-bold">{settings.sidebarPromoSub}</p>
                            </div>

                            <button onClick={() => navigate('home')} className="w-full flex items-center gap-4 p-4 rounded-2xl bg-pink-50 text-pink-600 font-black transition-all hover:bg-pink-100 hover:scale-[1.02] shadow-sm border border-pink-100/50 cursor-pointer"><Home size={20}/> الرئيسية الملكية</button>
                            <button onClick={() => navigate('all-products')} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 text-gray-700 font-bold transition-all border border-transparent hover:border-gray-100 hover:scale-[1.02] cursor-pointer"><ShoppingCart size={20}/> المنيو الكامل لـ حلويات بوسي</button>
                            
                            <button onClick={() => navigate('all-products')} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-pink-50/50 text-gray-700 font-bold transition-all border border-transparent hover:border-pink-50 hover:scale-[1.02] cursor-pointer group">
                                <div className="flex items-center gap-4"><Flame size={20} className="text-orange-500 group-hover:animate-bounce"/> العروض الخاصة</div>
                                <span className="bg-orange-100 text-orange-600 text-[9px] px-2 py-1 rounded-md">جديد</span>
                            </button>

                            <div className="my-8 border-t border-gray-50 pt-6">
                                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 px-2 flex items-center gap-2"><Layers size={14}/> تسوق حسب القسم</span>
                                <div className="space-y-2">
                                    {appCategories.map(cat => (
                                        <button key={cat.id} onClick={() => navigate('all-products', null, cat.name)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-pink-50 text-gray-600 hover:text-pink-600 font-bold text-sm transition-all group cursor-pointer border border-transparent hover:border-pink-100 shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-pink-500 overflow-hidden border border-gray-200 group-hover:border-pink-300 transition-colors">
                                                    {cat.img ? <img src={cat.img} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt=""/> : <Award size={16}/>}
                                                </div>
                                                {cat.name}
                                            </div>
                                            <ChevronLeft size={16} className="text-gray-300 group-hover:text-pink-500 group-hover:-translate-x-1 transition-all" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="my-6 border-t border-gray-50 pt-6">
                                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4 px-2 flex items-center gap-2"><Info size={14}/> خدمة عملاء حلويات بوسي</span>
                                <div className="flex flex-col gap-3 px-2 text-sm text-gray-500 font-bold">
                                    <div className="flex items-center gap-3"><Clock size={16} className="text-pink-400"/> {settings.storeHours}</div>
                                    <div className="flex items-center gap-3"><Truck size={16} className="text-pink-400"/> توصيل سريع وآمن</div>
                                    <div className="flex items-center gap-3"><ShieldCheck size={16} className="text-pink-400"/> جودة ملكية مضمونة</div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50/80 z-10 relative">
                            <p className="text-[11px] font-black text-gray-500 uppercase tracking-widest mb-4 text-center">تواصل معنا المباشر</p>
                            <div className="flex justify-center gap-4">
                                <a href={`https://wa.me/${settings.phone}`} target="_blank" rel="noreferrer" className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-green-500 shadow-md hover:scale-110 transition-transform border border-gray-100 cursor-pointer"><MessageCircle size={22}/></a>
                                {settings.facebook && <a href={settings.facebook} target="_blank" rel="noreferrer" className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-md hover:scale-110 transition-transform border border-gray-100 cursor-pointer"><Facebook size={22}/></a>}
                                {settings.instagram && <a href={settings.instagram} target="_blank" rel="noreferrer" className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-pink-500 shadow-md hover:scale-110 transition-transform border border-gray-100 cursor-pointer"><Instagram size={22}/></a>}
                            </div>
                        </div>

                        <div 
                          className="absolute bottom-2 right-2 w-16 h-16 bg-transparent cursor-default outline-none z-50" 
                          onClick={() => { setIsSidebarOpen(false); setCurrentPage('admin-login'); }} 
                          style={{ WebkitTapHighlightColor: 'transparent' }}>
                        </div>
                    </div>
                </div>
            )}

            {/* 🌟 DEVELOPED CART DRAWER 🌟 */}
            {isCartOpen && (
                <div className="fixed inset-0 z-[700] flex justify-end">
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300" onClick={() => setIsCartOpen(false)}></div>
                    <div className="relative w-full max-w-[480px] bg-[#fdfdfd] h-full shadow-2xl flex flex-col animate-slide-left overflow-hidden">
                        
                        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white shadow-sm z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-pink-50 rounded-full flex items-center justify-center text-pink-600"><ShoppingCart size={20} /></div>
                                <div><h2 className="text-lg font-black text-gray-900">السلة الملكية</h2><p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{cartItemsCount} عناصر مختارة من حلويات بوسي</p></div>
                            </div>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"><X size={22}/></button>
                        </div>

                        <div className="flex-1 overflow-y-auto hide-scroll p-6 flex flex-col gap-4">
                            {cart.length > 0 ? (
                                <>
                                    <div className="space-y-4">
                                        {cart.map(item => (
                                            <div key={item.cartId} className="flex gap-4 p-4 bg-white rounded-[24px] border border-gray-100 relative group animate-fadeIn shadow-sm hover:border-pink-200 transition-colors">
                                                <img src={item.img} className="w-20 h-20 rounded-[18px] object-cover shadow-sm border border-gray-50" alt="" />
                                                <div className="flex-1 text-right flex flex-col justify-center">
                                                    <h5 className="font-bold text-[14px] text-gray-800 mb-1">{item.name}</h5>
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <span className="text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md text-[10px] font-black">{item.flavor}</span>
                                                        {item.label && <span className="text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md text-[10px] font-bold">{item.label}</span>}
                                                    </div>
                                                    <div className="flex justify-between items-center w-full">
                                                        <div className="flex items-center bg-gray-50 rounded-full p-1 border border-gray-100">
                                                            <button disabled={isSyncing} onClick={() => updateCartQty(item.cartId, -1)} className="p-1 hover:text-pink-600 hover:bg-white rounded-full transition-colors text-gray-500 cursor-pointer"><Minus size={14}/></button>
                                                            <span className="w-6 text-center font-black text-[13px] text-gray-800">{item.quantity}</span>
                                                            <button disabled={isSyncing} onClick={() => updateCartQty(item.cartId, 1)} className="p-1 hover:text-pink-600 hover:bg-white rounded-full transition-colors text-gray-500 cursor-pointer"><Plus size={14}/></button>
                                                        </div>
                                                        <span className="font-black text-pink-600 text-lg">{(Number(item.price) || 0) * (Number(item.quantity) || 0)} ج</span>
                                                    </div>
                                                </div>
                                                <button onClick={() => removeCartItem(item.cartId)} className="absolute top-3 left-3 text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors cursor-pointer"><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* 🌟 NEW: SMART CART RECOMMENDATIONS 🌟 */}
                                    {cartRecommendations.length > 0 && (
                                        <div className="mt-8 border-t border-gray-100 pt-6 animate-fadeIn">
                                            <h4 className="text-[12px] font-black mb-4 text-gray-500 uppercase tracking-wider flex items-center gap-2"><Sparkles size={14} className="text-pink-400"/> أضف لمسة سحرية لطلبك:</h4>
                                            <div className="flex gap-4 overflow-x-auto hide-scroll pb-4 -mx-2 px-2">
                                                {cartRecommendations.map(p => (
                                                    <div key={p.id} onClick={() => { setIsCartOpen(false); navigate('product-detail', p); }} className="flex-none w-32 bg-white rounded-[20px] p-2 border border-gray-100 shadow-sm cursor-pointer hover:border-pink-300 transition-colors group text-center">
                                                        <img src={p.img} className="w-full h-20 object-cover rounded-[14px] mb-2 group-hover:scale-105 transition-transform" alt="" />
                                                        <h6 className="text-[11px] font-bold text-gray-800 truncate mb-1 px-1">{p.name}</h6>
                                                        <span className="text-[10px] text-pink-500 font-black flex items-center justify-center gap-1">عرض التفاصيل <ChevronLeft size={10}/></span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-80 animate-fadeIn">
                                    <div className="w-32 h-32 bg-pink-50 rounded-full flex items-center justify-center mb-6 shadow-inner border-4 border-white">
                                        <ShoppingBag size={50} className="text-pink-300"/>
                                    </div>
                                    <h3 className="font-black text-xl text-gray-800 mb-2">سلتك الملكية فارغة</h3>
                                    <p className="text-sm text-gray-500 font-bold mb-8">لم تقم بإضافة أي من إبداعات حلويات بوسي الفاخرة حتى الآن.</p>
                                    <button onClick={() => { setIsCartOpen(false); navigate('all-products'); }} className="bg-pink-600 text-white px-8 py-3.5 rounded-full font-black text-sm shadow-xl shadow-pink-200 hover:scale-105 transition-transform cursor-pointer">استكشف المنيو الآن</button>
                                </div>
                            )}
                        </div>

                        {cart.length > 0 && (
                            <div className="bg-white border-t border-gray-100 p-6 pt-4 z-10 shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                                <div className="mb-5 space-y-3">
                                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1">بيانات التوصيل من حلويات بوسي</h4>
                                    <input type="text" placeholder="الاسم الكريم" value={checkoutData.name} onChange={(e) => setCheckoutData({...checkoutData, name: e.target.value})} className="w-full p-3.5 bg-gray-50 border border-gray-100 focus:border-pink-300 rounded-[16px] text-sm font-bold outline-none transition-colors" />
                                    <div className="flex gap-3">
                                        <input type="tel" placeholder="رقم الهاتف" value={checkoutData.phone} onChange={(e) => setCheckoutData({...checkoutData, phone: e.target.value})} className="w-1/2 p-3.5 bg-gray-50 border border-gray-100 focus:border-pink-300 rounded-[16px] text-sm font-bold outline-none transition-colors text-right" dir="rtl" />
                                        <input type="text" placeholder="العنوان مفصلاً" value={checkoutData.address} onChange={(e) => setCheckoutData({...checkoutData, address: e.target.value})} className="w-1/2 p-3.5 bg-gray-50 border border-gray-100 focus:border-pink-300 rounded-[16px] text-sm font-bold outline-none transition-colors" />
                                    </div>
                                </div>
                                <div className="space-y-2 mb-6 px-1">
                                    <div className="flex justify-between items-center text-sm font-bold text-gray-500"><span>المجموع الفرعي:</span><span>{cartTotal} ج.م</span></div>
                                    <div className="flex justify-between items-center text-sm font-bold text-gray-500 border-b border-gray-50 pb-3"><span>رسوم التوصيل المبدئية:</span><span>{Number(settings.shippingCost) || '0'} ج.م</span></div>
                                    <div className="flex justify-between items-center pt-2"><span className="text-gray-800 font-black text-lg">الإجمالي النهائي:</span><span className="text-3xl text-pink-600 font-black tracking-tighter">{cartTotal + (Number(settings.shippingCost) || 0)} <span className="text-lg">ج.م</span></span></div>
                                </div>
                                <button disabled={isSyncing} onClick={sendWhatsAppOrder} className="w-full bg-green-500 text-white py-4.5 rounded-[20px] font-black text-lg shadow-xl shadow-green-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 hover:bg-green-600 disabled:opacity-50 cursor-pointer">
                                    تأكيد الطلب لإدارة حلويات بوسي <MessageCircle size={22} className="fill-current"/>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {currentPage !== 'admin-login' && currentPage !== 'admin-dashboard' && (
                <button 
                    onClick={scrollToTop} 
                    className={`fixed bottom-6 left-6 p-4 rounded-full bg-pink-600 text-white shadow-xl shadow-pink-500/30 z-[400] transition-all duration-500 transform hover:-translate-y-2 hover:bg-pink-700 ${showScrollTop ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-50 pointer-events-none'}`}
                    title="العودة للأعلى"
                >
                    <ArrowUp size={24} />
                </button>
            )}

            {/* FOOTER (DYNAMIC NOW) */}
            {currentPage !== 'admin-login' && (
                <footer className="bg-white px-10 pt-24 pb-12 border-t border-gray-100 text-center relative overflow-hidden">
                    <h1 className="text-4xl font-bold text-gray-800 tracking-tighter mb-4">{settings.siteTitle}</h1>
                    <p className="text-[10px] font-bold uppercase tracking-[0.5em] mb-16" style={{ color: pink.vibrant }}>BOSE SWEETS & ROSES</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-right mb-16 font-bold border-b border-gray-50 pb-16">
                        <div className="text-right"><h4 className="font-black text-xl mb-8 border-r-4 pr-4 border-pink-600">{settings.siteTitle}</h4><p className="text-gray-500 text-[14px] font-bold">{settings.footerAbout}</p></div>
                        <div className="text-right"><h4 className="font-black text-xl mb-8 border-r-4 pr-4 border-pink-600 text-right">تواصل مع إدارة حلويات بوسي</h4><div className="space-y-4 text-gray-600 text-[15px] font-bold"><p className="flex items-center gap-4 justify-end"><Phone size={20}/> {settings.phone}</p><p className="flex items-center gap-4 justify-end"><MapPin size={20}/> {settings.address}</p></div></div>
                    </div>
                    <p className="text-[11px] text-gray-400 font-black tracking-[0.3em] uppercase">© {new Date().getFullYear()} BOSE SWEETS - QUALITY CRAFTED SINCE 2014</p>
                </footer>
            )}
        </div>
    );
  };

  // FINAL RENDER RETURN
  return (
    <ErrorBoundary>
      {toast && (<div className={`fixed top-12 left-1/2 -translate-x-1/2 z-[1000] px-8 py-4 rounded-full shadow-2xl animate-fadeIn font-black flex items-center gap-3 border-2 ${toast.type === 'error' ? 'bg-red-50 border-red-500 text-red-600' : 'bg-white border-pink-500 text-pink-600'}`}>{toast.type === 'error' ? <X size={18}/> : <Check size={18}/>} {toast.message || toast}</div>)}
      {currentPage === 'admin-dashboard' && isAdminAuthenticated ? renderAdminDashboard() : renderPublicView()}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
        .font-cairo { font-family: 'Cairo', sans-serif; }
        @keyframes marquee-seamless { 0% { transform: translateX(0); } 100% { transform: translateX(25%); } }
        @keyframes waterfall-up { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
        @keyframes waterfall-down { 0% { transform: translateY(-50%); } 100% { transform: translateY(0); } }
        @keyframes slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes slide-left { from { transform: translateX(-100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 100% { transform: translateX(200%) skewX(-30deg); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
        @keyframes scaleUp { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-marquee-seamless { display: flex; width: max-content; animation: marquee-seamless 25s linear infinite; }
        .animate-waterfall-up { animation: waterfall-up 50s linear infinite; }
        .animate-waterfall-down { animation: waterfall-down 50s linear infinite; }
        .animate-slide { animation: slide 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-slide-left { animation: slide-left 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-fadeIn { animation: fadeIn 0.8s forwards; }
        .animate-shimmer { animation: shimmer 3s infinite; }
        .animate-scale-up { animation: scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .card-3d-wrapper { perspective: 1000px; }
        .card-3d { transform-style: preserve-3d; transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); }
        .card-3d-wrapper:hover .card-3d { transform: rotateY(-15deg) rotateX(10deg) scale(1.05); }
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .chart-line { stroke-dasharray: 1000; stroke-dashoffset: 1000; animation: drawLine 2s ease-out forwards; }
        @keyframes drawLine { to { stroke-dashoffset: 0; } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(30, 41, 59, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(236,72,153,0.4); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(236,72,153,0.6); }
      `}</style>
    </ErrorBoundary>
  );
};

export default React.memo(App);

```
