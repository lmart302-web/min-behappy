import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 기존 프로젝트의 Firebase 웹 앱 설정값을 입력하세요.
// Firebase Console > 프로젝트 설정 > 내 앱 > SDK 설정 및 구성에서 확인할 수 있습니다.
const firebaseConfig = {
  apiKey: "AIzaSyCx_a21s37ua4Or8v8o1peDPzykPHtx-S8",
  authDomain: "min-behappy.firebaseapp.com",
  projectId: "min-behappy",
  storageBucket: "min-behappy.firebasestorage.app",
  messagingSenderId: "973137249269",
  appId: "1:973137249269:web:9c778c9e9d7436974496bc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
