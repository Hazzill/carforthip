"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/app/lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, GeoPoint, query, where, getDocs } from 'firebase/firestore';
import Image from 'next/image';
import { useLiffContext } from '@/context/LiffProvider';
import { sendLineMessage } from '@/app/actions/lineActions';
import { sendTelegramMessageToAdmin } from '@/app/actions/telegramActions';

function ConfirmPageContent() {
  const { profile, loading: liffLoading } = useLiffContext();
  const [vehicle, setVehicle] = useState(null);
  const [bookingDetails, setBookingDetails] = useState(null);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '' });
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- START: อัปเดตส่วนนี้ ---
  useEffect(() => {
    // ฟังก์ชันสำหรับดึงข้อมูลลูกค้าที่เคยบันทึกไว้
    const fetchCustomerData = async () => {
        if (profile?.userId) {
            const customerRef = doc(db, "customers", profile.userId);
            const customerSnap = await getDoc(customerRef);

            if (customerSnap.exists()) {
                // ถ้ามีข้อมูลลูกค้าอยู่แล้ว ให้นำมาใส่ในฟอร์ม
                const customerData = customerSnap.data();
                setCustomerInfo({
                    name: customerData.name || profile.displayName || '',
                    phone: customerData.phone || '',
                    email: customerData.email || ''
                });
            } else {
                // ถ้าเป็นลูกค้าใหม่ ให้ใช้ชื่อจาก LINE เป็นค่าเริ่มต้น
                setCustomerInfo(prev => ({ ...prev, name: profile.displayName || '' }));
            }
        }
    };
    fetchCustomerData();
  }, [profile]);
  // --- END: อัปเดตส่วนนี้ ---

  useEffect(() => {
    const params = {
      vehicleId: searchParams.get('vehicleId'),
      passengers: searchParams.get('passengers'),
      bags: searchParams.get('bags'),
      originAddress: searchParams.get('originAddress'),
      originLat: searchParams.get('originLat'),
      originLng: searchParams.get('originLng'),
      destAddress: searchParams.get('destAddress'),
      destLat: searchParams.get('destLat'),
      destLng: searchParams.get('destLng'),
      pickupDateTime: searchParams.get('pickupDateTime'),
    };
    
    if (!params.vehicleId) {
      if (!liffLoading) router.push('/booking');
      return;
    }
    setBookingDetails(params);

    const fetchVehicle = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, "vehicles", params.vehicleId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setVehicle({ id: docSnap.id, ...docSnap.data() });
        } else {
          throw new Error("ไม่พบข้อมูลรถ");
        }
      } catch (err) {
        alert(err.message);
        router.push('/booking');
      } finally {
        setLoading(false);
      }
    };
    fetchVehicle();
  }, [searchParams, router, liffLoading]);
  
  const handleConfirmBooking = async () => {
    if (!profile?.userId) {
        alert("ไม่สามารถระบุตัวตนผู้ใช้ได้");
        return;
    }
    if (!customerInfo.name || !customerInfo.phone || !customerInfo.email) {
      alert("กรุณากรอกข้อมูลผู้ติดต่อให้ครบถ้วน");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // บันทึก/อัปเดตข้อมูลลูกค้าใน collection 'customers'
      const customerRef = doc(db, "customers", profile.userId);
      await setDoc(customerRef, {
          lineUserId: profile.userId,
          displayName: profile.displayName,
          name: customerInfo.name,
          pictureUrl: profile.pictureUrl || '',
          email: customerInfo.email,
          phone: customerInfo.phone,
          lastActivity: serverTimestamp()
      }, { merge: true });

      const combinedDateTime = new Date(bookingDetails.pickupDateTime);
      // ... (Availability check logic can be added here) ...

      const finalBookingData = {
        userId: profile.userId,
        userInfo: {
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl || '',
        },
        vehicleId: bookingDetails.vehicleId,
        vehicleInfo: {
          brand: vehicle.brand,
          model: vehicle.model,
          plateNumber: vehicle.plateNumber,
          imageUrl: vehicle.imageUrl || '',
        },
        status: 'confirmed',
        pickupInfo: {
          address: bookingDetails.originAddress,
          dateTime: combinedDateTime,
          latlng: new GeoPoint(parseFloat(bookingDetails.originLat), parseFloat(bookingDetails.originLng)),
        },
        dropoffInfo: {
          address: bookingDetails.destAddress,
          latlng: new GeoPoint(parseFloat(bookingDetails.destLat), parseFloat(bookingDetails.destLng)),
        },
        customerInfo: { 
          name: customerInfo.name,
          phone: customerInfo.phone,
          email: customerInfo.email,
        },
        tripDetails: {
            noteToDriver: note,
            passengers: Number(bookingDetails.passengers),
            bags: Number(bookingDetails.bags),
        },
        paymentInfo: { totalPrice: 1500, paymentStatus: 'unpaid' },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "bookings"), finalBookingData);

      // --- Notification Logic ---
      const customerMessage = "เราได้รับการจองของคุณแล้ว กำลังรอแอดมินยืนยันและมอบหมายคนขับค่ะ";
      await sendLineMessage(profile.userId, customerMessage);

      const adminMessage = `🔔 มีรายการจองใหม่!\n\n*ลูกค้า:* ${customerInfo.name}\n*รับที่:* ${bookingDetails.originAddress}\n*เวลานัด:* ${combinedDateTime.toLocaleString('th-TH')}`;
      await sendTelegramMessageToAdmin(adminMessage);

      alert("ทำการจองเรียบร้อยแล้ว!");
      router.push('/my-bookings');

    } catch (error) {
      console.error("Error confirming booking: ", error);
      alert("เกิดข้อผิดพลาดในการยืนยันการจอง");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (liffLoading || loading || !bookingDetails) {
    return <div className="p-4 text-center">กำลังโหลด...</div>;
  }

  return (
    <main className="p-4 space-y-4">
      {vehicle && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-bold text-lg mb-2">สรุปการจองของคุณ</h2>
          <div className="flex items-center space-x-4">
              <Image src={vehicle.imageUrl || '/placeholder.png'} alt={vehicle.brand} width={80} height={80} className="rounded-md object-cover"/>
              <div>
                  <p className="font-bold">{vehicle.brand} {vehicle.model}</p>
                  <p className="text-sm text-gray-500">ผู้โดยสาร: {bookingDetails.passengers} | กระเป๋า: {bookingDetails.bags}</p>
              </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-lg shadow p-4 text-sm">
          <h2 className="font-bold text-lg mb-2">รายละเอียดการเดินทาง</h2>
          <p><strong>รับที่:</strong> {bookingDetails.originAddress}</p>
          <p><strong>ส่งที่:</strong> {bookingDetails.destAddress}</p>
          <p><strong>เวลานัด:</strong> {new Date(bookingDetails.pickupDateTime).toLocaleString('th-TH')}</p>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-bold text-lg mb-2">ข้อมูลผู้ติดต่อและหมายเหตุ</h2>
          <div className="space-y-4">
              <input type="text" name="name" placeholder="ชื่อ-นามสกุล" value={customerInfo.name} onChange={(e) => setCustomerInfo({...customerInfo, name: e.target.value})} required className="w-full p-2 border rounded-md" />
              <input type="tel" name="phone" placeholder="เบอร์โทรศัพท์" value={customerInfo.phone} onChange={(e) => setCustomerInfo({...customerInfo, phone: e.target.value})} required className="w-full p-2 border rounded-md" />
              <input type="email" name="email" placeholder="อีเมล" value={customerInfo.email} onChange={(e) => setCustomerInfo({...customerInfo, email: e.target.value})} required className="w-full p-2 border rounded-md" />
              <textarea name="note" value={note} onChange={(e) => setNote(e.target.value)} rows="3" className="w-full p-2 border rounded-md" placeholder="หมายเหตุถึงคนขับ (ถ้ามี)"></textarea>
          </div>
      </div>

      <button onClick={handleConfirmBooking} disabled={isSubmitting} className="w-full mt-4 p-3 bg-green-600 text-white rounded-lg font-bold text-lg hover:bg-green-700 disabled:bg-gray-400">
        {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการจอง'}
      </button>
    </main>
  );
}

export default function ConfirmBookingPage() {
    return (
        <Suspense fallback={<div className="p-4 text-center">Loading Page...</div>}>
            <ConfirmPageContent />
        </Suspense>
    );
}
