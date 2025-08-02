"use client";

import { useState, useEffect, useMemo } from 'react';
import { db } from '@/app/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import Link from 'next/link';
import Image from 'next/image';

// --- Status Translations ---
const statusTranslations = {
    'confirmed': 'รอมอบหมายงาน',
    'assigned': 'มอบหมายแล้ว',
    'stb': 'คนขับถึงจุดรับ',
    'pickup': 'กำลังเดินทาง',
    'completed': 'สำเร็จ',
    'cancelled': 'ยกเลิก',
    'noshow': 'ไม่พบลูกค้า'
};

const statusTabs = [
    { key: 'ongoing', label: 'งานที่กำลังดำเนิน', statuses: ['confirmed', 'assigned', 'stb', 'pickup'] },
    { key: 'finished', label: 'งานเสร็จสิ้น', statuses: ['completed', 'cancelled', 'noshow'] }
];

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

export default function AdminDashboardPage() {
    const [allBookings, setAllBookings] = useState([]);
    const [filteredBookings, setFilteredBookings] = useState([]);
    const [activeTab, setActiveTab] = useState('ongoing');
    const [dateFilter, setDateFilter] = useState({
        type: 'today',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });
    const [loading, setLoading] = useState(true);
    const [drivers, setDrivers] = useState({});

    useEffect(() => {
        const bookingsQuery = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
        const unsubscribeBookings = onSnapshot(bookingsQuery, async (querySnapshot) => {
            const bookingsData = await Promise.all(querySnapshot.docs.map(async (bookingDoc) => {
                const booking = { id: bookingDoc.id, ...bookingDoc.data() };
                if (booking.driverId && !drivers[booking.driverId]) {
                    const driverRef = doc(db, 'drivers', booking.driverId);
                    const driverSnap = await getDoc(driverRef);
                    if (driverSnap.exists()) {
                        setDrivers(prev => ({ ...prev, [booking.driverId]: driverSnap.data() }));
                    }
                }
                return booking;
            }));
            setAllBookings(bookingsData);
            setLoading(false);
        });

        return () => unsubscribeBookings();
    }, [drivers]);

    useEffect(() => {
        const currentTab = statusTabs.find(tab => tab.key === activeTab);
        if (currentTab) {
            let filtered = allBookings.filter(booking => currentTab.statuses.includes(booking.status));

            if (dateFilter.startDate && dateFilter.endDate) {
                const startOfDay = new Date(dateFilter.startDate);
                startOfDay.setHours(0, 0, 0, 0);

                const endOfDay = new Date(dateFilter.endDate);
                endOfDay.setHours(23, 59, 59, 999);

                filtered = filtered.filter(booking => {
                    const bookingDate = booking.pickupInfo.dateTime.toDate();
                    return bookingDate >= startOfDay && bookingDate <= endOfDay;
                });
            }
            
            setFilteredBookings(filtered);
        }
    }, [allBookings, activeTab, dateFilter]);

    const setDateRange = (type) => {
        const today = new Date();
        let startDate, endDate;

        switch (type) {
            case 'week':
                const firstDayOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1))); // Monday
                const lastDayOfWeek = new Date(firstDayOfWeek);
                lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 6); // Sunday
                startDate = firstDayOfWeek;
                endDate = lastDayOfWeek;
                break;
            case 'month':
                startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                break;
            case 'today':
            default:
                startDate = today;
                endDate = today;
                break;
        }
        
        setDateFilter({
            type: type,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        });
    };

    if (loading) {
        return <div className="text-center p-10">Loading Dashboard...</div>;
    }

    return (
        <div className="container mx-auto p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                {/* Status Filter Tabs */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-6 overflow-x-auto">
                        {statusTabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
                                    activeTab === tab.key
                                    ? 'border-slate-800 text-slate-900'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
                {/* Date Filter */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setDateRange('today')} className={`px-3 py-1 text-sm rounded-md ${dateFilter.type === 'today' ? 'bg-slate-800 text-white' : 'bg-white'}`}>วันนี้</button>
                    <button onClick={() => setDateRange('week')} className={`px-3 py-1 text-sm rounded-md ${dateFilter.type === 'week' ? 'bg-slate-800 text-white' : 'bg-white'}`}>สัปดาห์นี้</button>
                    <button onClick={() => setDateRange('month')} className={`px-3 py-1 text-sm rounded-md ${dateFilter.type === 'month' ? 'bg-slate-800 text-white' : 'bg-white'}`}>เดือนนี้</button>
                    <div className="flex items-center gap-2">
                        <input 
                            type="date"
                            value={dateFilter.startDate}
                            onChange={(e) => setDateFilter({ ...dateFilter, type: 'custom', startDate: e.target.value })}
                            className="p-1.5 border rounded-md shadow-sm text-sm"
                        />
                        <span>-</span>
                        <input 
                            type="date"
                            value={dateFilter.endDate}
                            onChange={(e) => setDateFilter({ ...dateFilter, type: 'custom', endDate: e.target.value })}
                            className="p-1.5 border rounded-md shadow-sm text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Bookings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredBookings.length > 0 ? filteredBookings.map(booking => {
                    const driver = booking.driverId ? drivers[booking.driverId] : null;
                    return (
                        <div key={booking.id} className="bg-white rounded-lg shadow-md flex flex-col">
                            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                                <p className="font-bold text-slate-800">บิล {booking.id.substring(0, 6).toUpperCase()}</p>
                                <p className="text-sm text-gray-600">
                                    {booking.pickupInfo.dateTime.toDate().toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' })} เวลา: {booking.pickupInfo.dateTime.toDate().toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})}
                                </p>
                            </div>
                            <div className="p-4 space-y-3 flex-grow">
                                <div className="flex items-center space-x-4">
                                    <Image src={booking.vehicleInfo.imageUrl || '/placeholder.png'} alt="car" width={64} height={64} className="rounded-md object-cover w-16 h-16"/>
                                    <div className="flex-grow">
                                        <p className="font-bold">{booking.vehicleInfo.brand} {booking.vehicleInfo.model}</p>
                                        <p className="text-sm text-gray-500">{booking.tripDetails.passengers} คน {booking.tripDetails.bags} กระเป๋า</p>
                                    </div>
                                    <div>
                                        <p className="font-semibold">{booking.customerInfo.name}</p>
                                        <p className="text-sm text-gray-500">{booking.customerInfo.phone}</p>
                                    </div>
                                </div>
                                <div className="text-sm space-y-1">
                                    <p><strong>รับ:</strong> {booking.pickupInfo.address}</p>
                                    <p><strong>ส่ง:</strong> {booking.dropoffInfo.address}</p>
                                </div>
                            </div>
                            <div className="p-4 border-t flex justify-between items-center">
                                <div>
                                    <p className="text-xs text-gray-500">พนักงานขับรถ</p>
                                    <p className="font-semibold">{driver ? `${driver.firstName} ${driver.lastName}` : 'ยังไม่มอบหมาย'}</p>
                                </div>
                                <Link href={`/bookings/${booking.id}`} className="bg-red-700 text-white px-6 py-2 rounded-lg font-base hover:bg-red-800">
                                    มอบหมายงาน
                                </Link>
                            </div>
                            <div className="bg-slate-800 p-3 rounded-b-lg text-white">
                                <p className="text-sm font-semibold">{statusTranslations[booking.status]}</p>
                                <ProgressBar status={booking.status} />
                            </div>
                        </div>
                    )
                }) : (
                    <div className="col-span-full text-center py-10 bg-white rounded-lg shadow-md">
                        <p className="text-gray-500">ไม่พบรายการจองสำหรับวันที่และสถานะที่เลือก</p>
                    </div>
                )}
            </div>
        </div>
    );
}
