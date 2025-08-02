"use client";

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const BookingMap = dynamic(
  () => import('@/app/components/BookingMap'), 
  { ssr: false }
);

import { db } from '@/app/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useLiffContext } from '@/context/LiffProvider';

function BookingStepOneContent() {
    const { loading: liffLoading } = useLiffContext();
    const [allLocations, setAllLocations] = useState([]);
    const [filteredLocations, setFilteredLocations] = useState([]);
    const [categories, setCategories] = useState(["All"]);
    const [selectedCategory, setSelectedCategory] = useState("All");
    const [origin, setOrigin] = useState(null);
    const [destination, setDestination] = useState(null);
    const [pickupDate, setPickupDate] = useState('');
    const [pickupTime, setPickupTime] = useState('');
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchLocations = async () => {
            setLoading(true);
            try {
                const locationsQuery = query(collection(db, 'pickup_locations'), orderBy('category'), orderBy('name'));
                const querySnapshot = await getDocs(locationsQuery);
                const locationsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setAllLocations(locationsData);
                setFilteredLocations(locationsData);
                if (locationsData.length > 0) {
                    setOrigin(locationsData[0]);
                    const uniqueCategories = ["All", ...new Set(locationsData.map(loc => loc.category))];
                    setCategories(uniqueCategories);
                }
            } catch (err) {
                console.error("Error fetching locations:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchLocations();
    }, []);

    const handleCategoryFilter = (category) => {
        setSelectedCategory(category);
        let filtered;
        if (category === "All") {
          filtered = allLocations;
        } else {
          filtered = allLocations.filter(loc => loc.category === category);
        }
        setFilteredLocations(filtered);
    
        if (filtered.length > 0) {
          setOrigin(filtered[0]);
        } else {
          setOrigin(null);
        }
    };

    const handleLocationSelect = (locationData) => setDestination(locationData);
    const handleOriginChange = (e) => setOrigin(allLocations.find(loc => loc.id === e.target.value));

    const handleNextStep = () => {
        if (!origin || !destination || !pickupDate || !pickupTime) {
            alert("กรุณากรอกข้อมูลการเดินทางให้ครบถ้วน");
            return;
        }

        const combinedPickupDateTime = `${pickupDate}T${pickupTime}`;

        const params = new URLSearchParams({
            originAddress: origin.address,
            originLat: origin.latlng.latitude,
            originLng: origin.latlng.longitude,
            destAddress: destination.address,
            destLat: destination.lat,
            destLng: destination.lng,
            pickupDateTime: combinedPickupDateTime,
        });
        router.push(`booking/select-vehicle?${params.toString()}`);
    };

    if (liffLoading || loading) return <div className="p-4 text-center">กำลังโหลด...</div>;

    return (
        <main className="p-4 space-y-4">
            <div className="bg-white p-4 rounded-lg shadow">
                <h2 className="font-bold text-lg mb-2">1. ระบุการเดินทางของคุณ</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">สถานที่รับ</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => handleCategoryFilter(cat)}
                                    className={`px-3 py-1 text-xs rounded-full font-semibold transition ${
                                        selectedCategory === cat ? 'bg-slate-800 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        <select
                            value={origin?.id || ''}
                            onChange={handleOriginChange}
                            className="w-full p-2 border rounded-md bg-white"
                            disabled={filteredLocations.length === 0}
                        >
                            {filteredLocations.length > 0 ? (
                                filteredLocations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)
                            ) : (
                                <option>ไม่พบสถานที่ในประเภทนี้</option>
                            )}
                        </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ต้องการรถ</label>
                            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} required className="w-full p-2 border rounded-md"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">เวลาที่ต้องการรถ</label>
                            <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} required className="w-full p-2 border rounded-md"/>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
                <label className="block text-sm font-medium text-gray-700 mb-2">สถานที่ส่ง</label>
                <BookingMap onLocationSelect={handleLocationSelect} />
            </div>
            <button onClick={handleNextStep} disabled={!origin || !destination || !pickupDate || !pickupTime} className="w-full mt-4 p-3 bg-slate-800 text-white rounded-lg font-bold text-lg disabled:bg-gray-400">
                ค้นหารถ
            </button>
        </main>
    );
}

export default function BookingStepOnePage() {
    return (
        <Suspense fallback={<div className="p-4 text-center">Loading Page...</div>}>
            <BookingStepOneContent />
        </Suspense>
    );
}
