"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/app/lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { sendLineMessage } from '@/app/actions/lineActions';

export default function BookingDetailPage() {
    const [booking, setBooking] = useState(null);
    const [drivers, setDrivers] = useState([]);
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [loading, setLoading] = useState(true);
    const [isAssigning, setIsAssigning] = useState(false);
    const params = useParams();
    const router = useRouter();
    const { id } = params;

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const bookingDocRef = doc(db, 'bookings', id);
                const bookingDocSnap = await getDoc(bookingDocRef);

                if (bookingDocSnap.exists()) {
                    setBooking({ id: bookingDocSnap.id, ...bookingDocSnap.data() });
                    setSelectedDriverId(bookingDocSnap.data().driverId || '');
                } else {
                    alert("ไม่พบข้อมูลการจอง");
                    router.push('/dashboard');
                }

                const driversQuery = query(collection(db, 'drivers'), where("status", "==", "available"));
                const driversSnapshot = await getDocs(driversQuery);
                const driversList = driversSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setDrivers(driversList);

            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id, router]);

    const handleAssignDriver = async () => {
        if (!selectedDriverId) {
            alert("กรุณาเลือกคนขับก่อน");
            return;
        }
        setIsAssigning(true);
        try {
            const tripDurationHours = 4;
            const startTime = booking.pickupInfo.dateTime.toDate();
            const endTime = new Date(startTime.getTime() + tripDurationHours * 60 * 60 * 1000);

            const conflictQuery = query(
                collection(db, 'bookings'),
                where("driverId", "==", selectedDriverId),
                where("status", "in", ["confirmed", "assigned", "stb", "pickup"]),
                where("pickupInfo.dateTime", ">=", startTime),
                where("pickupInfo.dateTime", "<", endTime)
            );

            const conflictSnapshot = await getDocs(conflictQuery);

            if (!conflictSnapshot.empty) {
                const isSameJob = conflictSnapshot.docs[0].id === id;
                if (!isSameJob) {
                    alert("คนขับคนนี้มีงานอื่นทับซ้อนในช่วงเวลานี้แล้ว");
                    setIsAssigning(false);
                    return;
                }
            }

            const bookingDocRef = doc(db, 'bookings', id);
            await updateDoc(bookingDocRef, {
                driverId: selectedDriverId,
                status: 'assigned',
                updatedAt: serverTimestamp()
            });

            const selectedDriver = drivers.find(d => d.id === selectedDriverId);

            // --- START: Notification Logic ---
            // สร้าง Notification สำหรับ Admin Sidebar
            await addDoc(collection(db, "notifications"), {
                message: `งานของ ${booking.customerInfo.name} ถูกมอบหมายให้ ${selectedDriver.firstName}`,
                type: 'assignment',
                bookingId: id,
                isRead: false,
                createdAt: serverTimestamp()
            });

            // แจ้งเตือนคนขับผ่าน LINE
            if (selectedDriver && selectedDriver.lineUserId) {
                const driverMessage = `คุณได้รับงานใหม่!\n\nลูกค้า: ${booking.customerInfo.name}\nรับที่: ${booking.pickupInfo.address}\nเวลา: ${booking.pickupInfo.dateTime.toDate().toLocaleString('th-TH')}`;
                await sendLineMessage(selectedDriver.lineUserId, driverMessage);
            }
            
            // แจ้งเตือนลูกค้าผ่าน LINE
            if (booking.userId) {
                const customerMessage = `การจองของคุณได้รับการยืนยันคนขับแล้ว!\n\nคนขับ: ${selectedDriver.firstName}\nรถ: ${booking.vehicleInfo.brand} ${booking.vehicleInfo.model}\nทะเบียน: ${booking.vehicleInfo.plateNumber}`;
                await sendLineMessage(booking.userId, customerMessage);
            }
            // --- END: Notification Logic ---

            alert("มอบหมายงานและส่งแจ้งเตือนสำเร็จ!");
            router.push('dashboard');

        } catch (error) {
            console.error("Error assigning driver:", error);
            alert("เกิดข้อผิดพลาดในการมอบหมายงาน");
        } finally {
            setIsAssigning(false);
        }
    };
    
    if (loading) return <div className="text-center mt-20">กำลังโหลดข้อมูล...</div>;
    if (!booking) return <div className="text-center mt-20">ไม่พบข้อมูลการจอง</div>;

    return (
        <div className="container mx-auto p-4 md:p-8">
            <h1 className="text-3xl font-bold mb-4">รายละเอียดการจอง #{booking.id.substring(0, 6)}</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white p-6 rounded-lg shadow-md space-y-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">ข้อมูลลูกค้า</h2>
                        <p>{booking.customerInfo.name} ({booking.customerInfo.phone})</p>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800">การเดินทาง</h2>
                        <p><strong>รับ:</strong> {booking.pickupInfo.address}</p>
                        <p><strong>ส่ง:</strong> {booking.dropoffInfo.address}</p>
                        <p><strong>วันเวลา:</strong> {booking.pickupInfo.dateTime.toDate().toLocaleString('th-TH')}</p>
                    </div>
                     <div>
                        <h2 className="text-lg font-semibold text-gray-800">รถที่ลูกค้าเลือก</h2>
                        <p>{booking.vehicleInfo.brand} {booking.vehicleInfo.model}</p>
                    </div>
                    {booking.tripDetails?.noteToDriver && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">หมายเหตุจากลูกค้า</h2>
                            <p className="text-gray-600 italic">{booking.tripDetails.noteToDriver}</p>
                        </div>
                    )}
                </div>

                <div className="md:col-span-1 bg-white p-6 rounded-lg shadow-md">
                    <h2 className="text-xl font-bold mb-4">มอบหมายงาน</h2>
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="driverSelect" className="block text-sm font-medium text-gray-700">เลือกคนขับที่ว่าง</label>
                            <select
                                id="driverSelect"
                                value={selectedDriverId}
                                onChange={(e) => setSelectedDriverId(e.target.value)}
                                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                            >
                                <option value="">-- ยังไม่ได้เลือก --</option>
                                {drivers.map(driver => (
                                    <option key={driver.id} value={driver.id}>
                                        {driver.firstName} {driver.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={handleAssignDriver}
                            disabled={loading || isAssigning || !selectedDriverId}
                            className="w-full bg-gray-900 text-white p-2 rounded-md font-semibold hover:bg-gray-700 disabled:bg-gray-400"
                        >
                            {isAssigning ? 'กำลังตรวจสอบ...' : 'ยืนยันการมอบหมาย'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
