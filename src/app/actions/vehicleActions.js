// src/app/actions/vehicleActions.js
"use server";

import { db } from '@/app/lib/firebaseAdmin'; // ตรวจสอบว่า import ถูกต้อง
import { revalidatePath } from 'next/cache';
import { FieldValue } from 'firebase-admin/firestore';

export async function addVehicle(formData) {
  try {
    const vehicleData = {
      plateNumber: formData.get('plateNumber'),
      brand: formData.get('brand'),
      model: formData.get('model'),
      type: formData.get('type'),
      color: formData.get('color'),
      status: 'available',
      createdAt: FieldValue.serverTimestamp(),
    };
    
    // บรรทัดนี้คือส่วนที่บันทึกข้อมูลจริงๆ
    // ตรวจสอบให้แน่ใจว่าไม่ได้ถูก comment ไว้
    const vehicleRef = await db.collection('vehicles').add(vehicleData);
    
    // Log นี้จะไปแสดงใน Terminal
    console.log('✅ Vehicle added to Firestore with ID: ', vehicleRef.id);

    revalidatePath('/admin/vehicles'); 

    return { success: true, message: `เพิ่มรถสำเร็จ ID: ${vehicleRef.id}` };

  } catch (error) {
    // Log นี้ก็จะไปแสดงใน Terminal เช่นกันหากเกิด Error
    console.error("🔥 Error adding vehicle to Firestore:", error);
    return { success: false, error: error.message };
  }
}