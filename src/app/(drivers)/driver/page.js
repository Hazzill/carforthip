"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/app/lib/firebase'; // Corrected path
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import Image from 'next/image';
import { useLiffContext } from '@/context/LiffProvider';
import { sendLineMessage } from '@/app/actions/lineActions'; // 1. Import Server Action

// --- Components ---
const statusTranslations = { 
    'assigned': 'ได้รับงาน', 
    'stb': 'ถึงจุดรับ', 
    'pickup': 'รับลูกค้า', 
    'completed': 'ส่งสำเร็จ', 
    'noshow': 'ไม่พบลูกค้า' 
};

function UpdateStatusModal({ job, onClose, onUpdate }) {
    const [status, setStatus] = useState(job.status);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);

    const statusOptions = {
        'assigned': [{ value: 'stb', text: 'ถึงจุดรับ (STB)' }],
        'stb': [{ value: 'pickup', text: 'รับลูกค้าแล้ว (PICKUP)' }],
        'pickup': [{ value: 'completed', text: 'ส่งลูกค้าแล้ว (COMPLETED)' }]
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // 2. ส่ง object 'job' ทั้งหมดไปในฟังก์ชัน onUpdate
        await onUpdate(job, status, note); 
        setLoading(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
                <h2 className="text-xl font-bold mb-4">อัปเดตสถานะงาน</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="status" className="block text-sm font-medium text-gray-700">เปลี่ยนสถานะเป็น</label>
                        <select
                            id="status"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full mt-1 p-2 border rounded-md bg-white"
                        >
                            <option value={job.status}>{statusTranslations[job.status]}</option>
                            {statusOptions[job.status]?.map(opt => <option key={opt.value} value={opt.value}>{opt.text}</option>)}
                            <option value="noshow">ไม่พบลูกค้า (NO SHOW)</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="note" className="block text-sm font-medium text-gray-700">หมายเหตุ</label>
                        <textarea
                            id="note"
                            rows="3"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            className="w-full mt-1 p-2 border rounded-md"
                            placeholder="เช่น รถติด, ถึงก่อนเวลา"
                        ></textarea>
                    </div>
                    <div className="flex justify-end space-x-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md">ยกเลิก</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 bg-orange-500 text-white rounded-md disabled:bg-gray-400">
                            {loading ? 'กำลังอัปเดต...' : 'อัปเดต'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const ProgressBar = ({ status }) => {
    const steps = ['assigned', 'stb', 'pickup', 'completed'];
    const currentStepIndex = steps.indexOf(status);

    return (
        <div className="w-full">
            <div className="flex justify-between mb-1">
                {steps.map((step, index) => (
                    <div key={step} className={`text-xs ${index <= currentStepIndex ? 'text-white' : 'text-gray-500'}`}>
                        {statusTranslations[step]}
                    </div>
                ))}
            </div>
            <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                    className="bg-green-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
                ></div>
            </div>
        </div>
    );
};

export default function DriverDashboardPage() {
    const { profile, loading: liffLoading, error: liffError } = useLiffContext();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedJob, setSelectedJob] = useState(null);

    useEffect(() => {
        if (liffLoading || !profile?.userId) {
            if (!liffLoading) setLoading(false);
            return;
        }

        const setupSubscription = async () => {
            setLoading(true);
            try {
                const driversQuery = query(collection(db, 'drivers'), where("lineUserId", "==", profile.userId));
                const driverSnapshot = await getDocs(driversQuery);

                if (driverSnapshot.empty) {
                    console.log("No matching driver found for this LINE user.");
                    setJobs([]);
                    setLoading(false);
                    return () => {};
                }

                const driverDocId = driverSnapshot.docs[0].id;
                
                const jobsQuery = query(
                    collection(db, 'bookings'),
                    where("driverId", "==", driverDocId),
                    where("status", "in", ["assigned", "stb", "pickup"])
                );

                const unsubscribe = onSnapshot(jobsQuery, (querySnapshot) => {
                    const jobsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setJobs(jobsData);
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching jobs:", error);
                    setLoading(false);
                });

                return unsubscribe;
            } catch (error) {
                console.error("Error setting up subscription:", error);
                setLoading(false);
                return () => {};
            }
        };

        const unsubscribePromise = setupSubscription();

        return () => {
            unsubscribePromise.then(unsub => unsub && unsub());
        };
    }, [profile, liffLoading]);

    // 3. แก้ไข handleUpdateStatus ให้รับ object 'job' ทั้งหมด
    const handleUpdateStatus = async (job, newStatus, note) => {
        const jobRef = doc(db, 'bookings', job.id);
        try {
            await updateDoc(jobRef, {
                status: newStatus,
                updatedAt: serverTimestamp(),
                statusHistory: arrayUnion({
                    status: newStatus,
                    note: note || "",
                    timestamp: new Date()
                })
            });

            // --- 🚀 START: ส่งข้อความแจ้งเตือนลูกค้า ---
            let customerMessage = '';
            switch (newStatus) {
                case 'stb':
                    customerMessage = `คนขับรถถึงจุดนัดรับแล้วค่ะ กรุณาเตรียมพร้อมสำหรับการเดินทาง`;
                    break;
                case 'pickup':
                    customerMessage = `คนขับได้รับคุณขึ้นรถแล้ว ขอให้เดินทางโดยสวัสดิภาพค่ะ`;
                    break;
                case 'completed':
                    customerMessage = `เดินทางถึงที่หมายเรียบร้อยแล้ว ขอบคุณที่ใช้บริการ CARFORTHIP ค่ะ`;
                    break;
                case 'noshow':
                    customerMessage = `คนขับไม่พบคุณที่จุดนัดรับตามเวลาที่กำหนด หากมีข้อสงสัยกรุณาติดต่อแอดมินค่ะ`;
                    break;
            }

            // ส่งข้อความถ้ามี userId ของลูกค้า และมีข้อความที่ต้องส่ง
            if (job.userId && customerMessage) {
                await sendLineMessage(job.userId, customerMessage);
            }
            // --- END: ส่งข้อความแจ้งเตือนลูกค้า ---

        } catch (error) {
            console.error("Error updating status: ", error);
            alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
        }
    };

    if (liffLoading) {
        return <div className="p-4 text-center">Initializing LIFF...</div>;
    }
    if (liffError) {
        return <div className="p-4 text-center text-red-500">LIFF Error: {liffError}</div>;
    }

    return (
        <main className="p-4">
            {selectedJob && <UpdateStatusModal job={selectedJob} onClose={() => setSelectedJob(null)} onUpdate={handleUpdateStatus} />}
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-bold">งานที่ได้รับ</h2>
                <Link href="/driver/history" className="text-sm font-semibold text-gray-600 bg-white px-3 py-1 rounded-full shadow-sm">
                    ประวัติ
                </Link>
            </div>

            {loading ? (
                <div className="text-center text-gray-500 mt-10">กำลังโหลดงาน...</div>
            ) : jobs.length === 0 ? (
                <div className="text-center text-gray-500 mt-10 bg-white p-6 rounded-lg shadow">
                    <p>ยังไม่มีงานที่ได้รับมอบหมายในขณะนี้</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {jobs.map(job => {
                        const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${job.pickupInfo.latlng.latitude},${job.pickupInfo.latlng.longitude}&destination=${job.dropoffInfo.latlng.latitude},${job.dropoffInfo.latlng.longitude}&travelmode=driving`;
                        return (
                            <div key={job.id} className="bg-white rounded-lg shadow p-4 space-y-3">
                                <div className="flex items-start space-x-4">
                                    <Image src={job.vehicleInfo.imageUrl || '/placeholder.png'} alt="car" width={70} height={70} className="rounded-md object-cover flex-shrink-0"/>
                                    <div className="flex-grow">
                                        <p className="font-bold">{job.vehicleInfo.brand} {job.vehicleInfo.model}</p>
                                        <p className="text-sm text-gray-500">
                                            {job.pickupInfo.dateTime.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                                            , {job.pickupInfo.dateTime.toDate().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                                        </p>
                                    </div>
                                </div>
                                <div className="border-t border-b border-gray-100 py-3 text-sm">
                                    <p><strong>รับที่:</strong> {job.pickupInfo.address}</p>
                                    <p><strong>ส่งที่:</strong> {job.dropoffInfo.address}</p>
                                    <div className="mt-2">
                                        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline">
                                            ดูเส้นทางใน Google Maps
                                        </a>
                                    </div>
                                </div>
                                <div className="bg-slate-800 rounded-lg p-3 text-white">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-300"></div>
                                        <div className="flex-grow">
                                            <p className="font-semibold text-sm">ลูกค้า: {job.customerInfo.name}</p>
                                            <ProgressBar status={job.status} />
                                        </div>
                                        <button onClick={() => setSelectedJob(job)} className="bg-orange-500 px-4 py-2 rounded-md font-semibold flex-shrink-0">
                                            อัปเดต
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </main>
    );
}
