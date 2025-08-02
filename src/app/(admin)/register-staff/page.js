// /app/admin/register-staff/page.js (หรือ path ที่คุณใช้)

"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { auth, db } from '@/app/lib/firebase';  
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore'; // ใช้ setDoc เพื่อควบคุม ID

export default function RegisterStaffPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    lineUserId: '',
    role: 'driver', // ค่าเริ่มต้นคือ 'driver'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // จัดการการเปลี่ยนแปลงใน input fields
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // จัดการการ submit ฟอร์ม
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); // ล้างข้อผิดพลาดเก่า

    // ตรวจสอบข้อมูลเบื้องต้นฝั่ง Client
    if (!formData.firstName || !formData.phone || !formData.email || !formData.password) {
        setError("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, เบอร์โทร, อีเมล, รหัสผ่าน)");
        return;
    }
    if (formData.password.length < 6) {
        setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        return;
    }

    setLoading(true);
    
    try {
      // --- Logic การลงทะเบียนฝั่ง Client ทั้งหมด ---

      // 1. สร้างผู้ใช้ใน Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password
      );
      const user = userCredential.user;

      // 2. อัปเดต Profile (ชื่อ) ของผู้ใช้ที่เพิ่งสร้าง
      await updateProfile(user, {
        displayName: `${formData.firstName} ${formData.lastName}`.trim(),
      });

      // 3. เตรียมข้อมูลสำหรับบันทึกลง Firestore
      const targetCollection = formData.role === 'driver' ? 'drivers' : 'admins';
      const dataToSave = {
        uid: user.uid, // ใช้ UID จาก user object ที่ได้มา
        firstName: formData.firstName,
        lastName: formData.lastName,
        phoneNumber: formData.phone,
        email: user.email, // ใช้อีเมลจาก user object เพื่อความแม่นยำ
        lineUserId: formData.lineUserId,
        status: 'available',
        createdAt: serverTimestamp(), // ใช้เวลาจากเซิร์ฟเวอร์เพื่อให้เป็นมาตรฐาน
      };

      if (formData.role === 'admin') {
        dataToSave.role = 'admin';
      }

      // 4. บันทึกข้อมูลลงใน Firestore (ใช้ setDoc และระบุ ID เองจาก UID)
      // วิธีนี้ทำให้ข้อมูลใน Auth และ Firestore เชื่อมกันด้วย ID เดียวกันเสมอ
      await setDoc(doc(db, targetCollection, user.uid), dataToSave);

      // 5. เมื่อทุกอย่างสำเร็จ
      alert(`เพิ่มผู้ใช้ตำแหน่ง ${formData.role} สำเร็จ!`);
      router.push('dashboard'); // หรือไปหน้าที่ต้องการ

    } catch (error) {
      // 6. จัดการข้อผิดพลาดจาก Firebase
      console.error("Error creating new user:", error.code, error.message);
      let errorMessage = "เกิดข้อผิดพลาดที่ไม่รู้จักในการลงทะเบียน";
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น";
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "รหัสผ่านไม่ปลอดภัย (ต้องมีอย่างน้อย 6 ตัวอักษร)";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "รูปแบบอีเมลไม่ถูกต้อง";
      }
      setError(errorMessage);
    } finally {
      // หยุดการโหลดไม่ว่าจะสำเร็จหรือล้มเหลว
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
            <Link href="dashboard" className="text-indigo-600 hover:underline mb-4 inline-block">← กลับไปหน้า Dashboard</Link>
            <div className="bg-white p-6 rounded-lg shadow-md">
                <h1 className="text-2xl font-bold mb-6">ลงทะเบียนผู้ใช้ใหม่ (แอดมิน / พนักงานขับรถ)</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">ชื่อจริง</label>
                            <input name="firstName" value={formData.firstName} onChange={handleChange} required className="w-full mt-1 p-2 border rounded-md"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">นามสกุล</label>
                            <input name="lastName" value={formData.lastName} onChange={handleChange} className="w-full mt-1 p-2 border rounded-md"/>
                        </div>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700">ตำแหน่ง</label>
                        <select name="role" value={formData.role} onChange={handleChange} className="w-full mt-1 p-2 border rounded-md bg-white">
                            <option value="driver">พนักงานขับรถ (Driver)</option>
                            <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
                        <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required className="w-full mt-1 p-2 border rounded-md"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">อีเมล (สำหรับเข้าระบบ)</label>
                        <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full mt-1 p-2 border rounded-md"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">รหัสผ่าน</label>
                        <input type="password" name="password" value={formData.password} onChange={handleChange} required placeholder="อย่างน้อย 6 ตัวอักษร" className="w-full mt-1 p-2 border rounded-md"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">LINE User ID (ถ้ามี)</label>
                        <input name="lineUserId" value={formData.lineUserId} onChange={handleChange} placeholder="U12345..." className="w-full mt-1 p-2 border rounded-md"/>
                    </div>
                    
                    {error && <p className="text-red-500 text-sm text-center font-semibold">{error}</p>}
                    
                    <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white p-2 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                      {loading ? 'กำลังบันทึก...' : 'ลงทะเบียนผู้ใช้'}
                    </button>
                </form>
            </div>
        </div>
    </div>
  );
}