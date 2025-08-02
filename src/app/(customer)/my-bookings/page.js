"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/app/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Image from 'next/image';
import { useLiffContext } from '@/context/LiffProvider';
import { sendLineMessage } from '@/app/actions/lineActions'; 
import { sendTelegramMessageToAdmin } from '@/app/actions/telegramActions';

const statusTranslations = {
    'confirmed': 'ยืนยันแล้ว',
    'assigned': 'คนขับรับงานแล้ว',
    'stb': 'คนขับกำลังไปรับ',
    'pickup': 'อยู่ระหว่างเดินทาง',
    'completed': 'ส่งสำเร็จ',
    'noshow': 'ไม่พบลูกค้า',
    'cancelled': 'ยกเลิก'
};

const ProgressBar = ({ status }) => {
    const steps = ['confirmed', 'assigned', 'stb', 'pickup', 'completed'];
    const currentStepIndex = steps.indexOf(status);
    if (currentStepIndex === -1) return null;

    return (
        <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
                className="bg-green-500 h-2.5 rounded-full transition-all duration-500" 
                style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
            ></div>
        </div>
    );
};

export default function MyBookingsPage() {
    const { profile, loading: liffLoading, error: liffError } = useLiffContext();
    const [activeBookings, setActiveBookings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (liffLoading || !profile?.userId) {
            if (!liffLoading) setLoading(false);
            return;
        }

        setLoading(true);
        const bookingsQuery = query(
            collection(db, 'bookings'),
            where("userId", "==", profile.userId),
            where("status", "in", ["confirmed", "assigned", "stb", "pickup"]),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(bookingsQuery, async (querySnapshot) => {
            const bookingsData = await Promise.all(querySnapshot.docs.map(async (bookingDoc) => {
                const job = { id: bookingDoc.id, ...bookingDoc.data() };
                if (job.driverId) {
                    const driverRef = doc(db, 'drivers', job.driverId);
                    const driverSnap = await getDoc(driverRef);
                    if (driverSnap.exists()) {
                        job.driverInfo = driverSnap.data();
                    }
                }
                return job;
            }));
            
            setActiveBookings(bookingsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching real-time bookings:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile, liffLoading]);

    const handleCancelBooking = async (bookingId) => {
        if (window.confirm("คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการจองนี้?")) {
            try {
                const bookingRef = doc(db, 'bookings', bookingId);
                const bookingToCancel = activeBookings.find(b => b.id === bookingId);

                if (!bookingToCancel) {
                    throw new Error("Could not find booking to cancel.");
                }

                await updateDoc(bookingRef, {
                    status: 'cancelled',
                    updatedAt: serverTimestamp()
                });
                
                const adminMessage = `🚫 การจองถูกยกเลิก!\n\n*ลูกค้า:* ${bookingToCancel.customerInfo.name}\n*เวลานัด:* ${bookingToCancel.pickupInfo.dateTime.toDate().toLocaleString('th-TH')}`;
                await sendTelegramMessageToAdmin(adminMessage);

                if (bookingToCancel.driverInfo && bookingToCancel.driverInfo.lineUserId) {
                    const driverMessage = `งานของคุณ (ลูกค้า: ${bookingToCancel.customerInfo.name}) ได้ถูกยกเลิกโดยลูกค้าแล้ว`;
                    await sendLineMessage(bookingToCancel.driverInfo.lineUserId, driverMessage);
                }

                alert("ยกเลิกการจองสำเร็จ");
            } catch (error) {
                console.error("Error cancelling booking:", error);
                alert("เกิดข้อผิดพลาดในการยกเลิก");
            }
        }
    };

    if (liffLoading) {
        return <div className="p-4 text-center">รอสักครู่...</div>;
    }

    if (liffError) {
        return <div className="p-4 text-center text-red-500">LIFF Error: {liffError}</div>;
    }

    return (
        <main className="p-4 space-y-4">
           
                <div className="bg-[#22252A]  p-6 rounded-lg text-center">
                    <Link href="/booking" className=" text-white  rounded-lg text-center font-bold">
                    จองรถ
                     </Link>               
            </div>

            <div className="flex bg-white rounded-full shadow-sm p-1">
                <button className="w-1/2 bg-[#22252A] text-white rounded-full py-2 font-semibold">รายการจองของฉัน</button>
                <Link href="/my-bookings/history" className="w-1/2 text-center py-2 text-gray-600 font-semibold">
                    ประวัติการจอง
                </Link>
            </div>

            {loading ? (
                <div className="text-center text-gray-500 pt-10">กำลังโหลดรายการจอง...</div>
            ) : activeBookings.length === 0 ? (
                <div className="text-center text-gray-500 pt-10">
                    <p>ไม่มีรายการจองที่กำลังดำเนินการ</p>
                </div>
            ) : (
                activeBookings.map(job => {
                    const originLat = job.pickupInfo.latlng.latitude;
                    const originLng = job.pickupInfo.latlng.longitude;
                    const destLat = job.dropoffInfo.latlng.latitude;
                    const destLng = job.dropoffInfo.latlng.longitude;
                    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`;

                    return (
                        <div key={job.id} className="bg-white rounded-lg shadow p-4 space-y-3">
                            <div className="flex items-center space-x-4">
                                <Image src={job.vehicleInfo.imageUrl || '/placeholder.png'} alt="car" width={80} height={80} className="rounded-md object-cover"/>
                                <div>
                                    <p className="font-bold">{job.vehicleInfo.brand} {job.vehicleInfo.model}</p>
                                    <p className="text-sm text-gray-500">วันที่นัด: {job.pickupInfo.dateTime.toDate().toLocaleDateString('th-TH')}</p>
                                    <p className="text-sm text-gray-500">เวลานัด: {job.pickupInfo.dateTime.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</p>
                                </div>
                            </div>
                            
                            <div className="border-t border-b border-gray-100 py-3 text-sm space-y-1">
                                <p><strong>รับที่:</strong> {job.pickupInfo.address}</p>
                                <p><strong>ส่งที่:</strong> {job.dropoffInfo.address}</p>
                                
                                {job.driverId && (
                                    <div className="pt-2">
                                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline">
                                            ดูเส้นทาง
                                        </a>
                                    </div>
                                )}
                            </div>
                            
                            {job.driverInfo ? (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                                        <Image 
                                            src={job.driverInfo.imageUrl || 'https://via.placeholder.com/150'} 
                                            alt="driver" 
                                            width={40} 
                                            height={40} 
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                        <div>
                                            <p className="text-sm font-semibold">พนักงานขับรถ</p>
                                            <p className="text-xs text-gray-500">{job.driverInfo.firstName} {job.driverInfo.lastName}</p>
                                        </div>
                                    </div>
                                    <a href={`tel:${job.driverInfo.phoneNumber}`} className="bg-gray-200 text-black px-4 py-2 rounded-lg font-semibold text-sm">
                                        โทร
                                    </a>
                                </div>
                            ) : job.driverId && (
                                <div className="text-xs text-gray-400">กำลังค้นหาคนขับ...</div>
                            )}

                            <div className="bg-[#22252A] rounded-lg p-3 text-white space-y-2">
                                <p className="text-sm font-semibold">{statusTranslations[job.status] || job.status}</p>
                                <ProgressBar status={job.status} />
                            </div>

                            {job.status === 'confirmed' && (
                                <div className="text-center border-t pt-3">
                                    <button onClick={() => handleCancelBooking(job.id)} className="text-sm font-semibold text-red-600 hover:underline">
                                        ยกเลิกการจอง
                                    </button>
                                </div>
                            )}
                        </div>
                    )
                })
            )}
        </main>
    );
}
