import { getGeminiResponse } from './aiService';
import ReactMarkdown from 'react-markdown';
import React, { useState, useEffect, useRef } from 'react';
import OpenSeadragon from 'openseadragon';

// BỘ TỪ ĐIỂN THIÊN VĂN THÔNG MINH (Chỉ chứa các mục tiêu phổ biến)
const POPULAR_TARGETS = [
  "M1 (Crab Nebula)", "M8 (Lagoon Nebula)", "M16 (Eagle Nebula / Pillars of Creation)", 
  "M31 (Andromeda Galaxy)", "M42 (Orion Nebula)", "M45 (Pleiades)", "M51 (Whirlpool Galaxy)", 
  "M57 (Ring Nebula)", "M87 (Virgo A)", "M101 (Pinwheel Galaxy)", "M104 (Sombrero Galaxy)",
  "Carina Nebula", "Tarantula Nebula", "Stephan's Quintet", "Cartwheel Galaxy", 
  "Southern Ring Nebula", "NGC 3324", "NGC 7320", "SMACS 0723", "Jupiter", "Saturn", "Neptune"
];

function App() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExploring, setIsExploring] = useState<boolean>(false);
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState<string>('');

  const [dziUrl, setDziUrl] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const osdViewerRef = useRef<OpenSeadragon.Viewer | null>(null);

  const [isMarkingEnabled, setIsMarkingEnabled] = useState<boolean>(false);
  const [isWaitingForDzi, setIsWaitingForDzi] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(180); 

  // UX: State cho thanh tìm kiếm thông minh
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Ẩn gợi ý khi click ra ngoài thanh tìm kiếm
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Hàm xử lý khi người dùng gõ phím
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (value.trim().length > 0) {
      // Lọc danh sách không phân biệt hoa thường
      const filtered = POPULAR_TARGETS.filter(target => 
        target.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  // Hàm xử lý khi người dùng click vào một gợi ý
  const handleSuggestionClick = (suggestion: string) => {
    // Chỉ lấy mã định danh chính (VD: "M101" từ "M101 (Pinwheel Galaxy)")
    const coreName = suggestion.split(" (")[0];
    setSearchQuery(coreName);
    setShowSuggestions(false);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWaitingForDzi) {
      interval = setInterval(() => {
        setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWaitingForDzi]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isExploring && dziUrl) {
      if (osdViewerRef.current) {
        osdViewerRef.current.destroy();
      }

      const viewer = OpenSeadragon({
        id: 'osd-viewer',
        prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
        tileSources: dziUrl,
        showNavigator: true,
        navigatorPosition: 'BOTTOM_RIGHT',
        showNavigationControl: false,
      });

      osdViewerRef.current = viewer;

      new OpenSeadragon.MouseTracker({
        element: viewer.canvas,
        clickHandler: (event: any) => {
          if (!isMarkingEnabled || !osdViewerRef.current) return;

          const webPoint = event.position;
          const viewportPoint = osdViewerRef.current.viewport.pointFromPixel(webPoint);
          console.log("Đã ghim tại:", viewportPoint);

          const markerElement = document.createElement("div");
          markerElement.className = "w-4 h-4 rounded-full bg-red-600 border-2 border-white shadow-lg pointer-events-none animate-pulse";

          osdViewerRef.current.addOverlay({
              element: markerElement,
              location: viewportPoint,
              placement: OpenSeadragon.Placement.CENTER
          });
        }
      });
    }

    return () => {
      if (osdViewerRef.current) {
        osdViewerRef.current.destroy();
      }
    };
  }, [isExploring, dziUrl, isMarkingEnabled]);

  const handleZoomIn = () => {
    osdViewerRef.current?.viewport.zoomBy(1.5);
    osdViewerRef.current?.viewport.applyConstraints();
  };

  const handleZoomOut = () => {
    osdViewerRef.current?.viewport.zoomBy(0.66);
    osdViewerRef.current?.viewport.applyConstraints();
  };

  const handleToggleMarkingMode = () => {
    setIsMarkingEnabled(prev => !prev);
  };

  const handleToggleFullScreen = () => {
    if (osdViewerRef.current) {
      osdViewerRef.current.setFullScreen(!osdViewerRef.current.isFullPage());
    }
  };

  const executeSearch = async (queryToSearch: string) => {
    if (queryToSearch.trim() === '') return;

    setShowSuggestions(false); // Đóng menu gợi ý
    const formattedQuery = queryToSearch.trim().toUpperCase().replace(/\s+/g, '_');

    setIsMarkingEnabled(false);
    if (osdViewerRef.current) {
      osdViewerRef.current.clearOverlays();
    }

    const cleanApiUrl = "https://gbachnguyen-jwst-backend-processor.hf.space";

    if (dziUrl) {
       try {
           fetch(`${cleanApiUrl}/api/v1/cleanup/`, { method: 'DELETE' });
       } catch (err) {
           console.log("Không thể gọi dọn rác, tiếp tục tải...");
       }
    }

    setMessages([]);
    setIsExploring(true);
    setDziUrl('');
    setIsWaitingForDzi(false);
    setTimeLeft(180);

    setMessages([{
      role: 'ai',
      text: `Đang thiết lập lại tọa độ. Khởi động quy trình quét dữ liệu cho mục tiêu mới: **${queryToSearch}**...`
    }]);

    try {
      const response = await fetch(`${cleanApiUrl}/api/v1/explore/${formattedQuery}`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        const fullDziUrl = `${cleanApiUrl}/static/${formattedQuery}.dzi`;

        if (data.status === 'ready' || data.task_id === 'cached') {
            setMessages(prev => [...prev, {
              role: 'ai',
              text: `✅ **Tải thành công!** Hệ thống đã lấy dữ liệu bản đồ **${queryToSearch}** từ bộ nhớ đệm.`
            }]);
            setDziUrl(fullDziUrl);
        } else {
            setMessages(prev => [...prev, {
              role: 'ai',
              text: `📡 Đã kích hoạt lõi xử lý thiên thể **${queryToSearch}**. NASA đang xử lý dữ liệu và phân rã ảnh DeepZoom. Vui lòng giữ kết nối...`
            }]);

            setIsWaitingForDzi(true);

            const checkInterval = setInterval(async () => {
                try {
                    const noCacheUrl = `${fullDziUrl}?t=${new Date().getTime()}`;
                    const statusRes = await fetch(noCacheUrl, { method: 'HEAD', cache: 'no-store' });
                    
                    if (statusRes.ok) {
                        clearInterval(checkInterval);
                        setIsWaitingForDzi(false);
                        setMessages(prev => [...prev, {
                          role: 'ai',
                          text: `✨ **Xử lý hoàn tất!** Bản đồ của **${queryToSearch}** đã sẵn sàng hiển thị.`
                        }]);
                        setDziUrl(fullDziUrl);
                    }
                } catch (err) {
                    // Chờ ngầm
                }
            }, 3000);

            setTimeout(() => {
                clearInterval(checkInterval);
                setIsWaitingForDzi(false);
            }, 300000);
        }
      } else {
        console.error("Lỗi phản hồi từ lõi vi xử lý:", response.statusText);
        setIsWaitingForDzi(false);
      }
    } catch (error) {
      console.error("Mất liên lạc đường truyền Backend!", error);
      setIsWaitingForDzi(false);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'Lỗi: Không thể kết nối tới máy chủ lõi. Vui lòng kiểm tra lại Backend.'
      }]);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    executeSearch(searchQuery);
  };

  const handleChatSubmit = async () => {
    if (chatInput.trim() !== '') {
      const textToSend = chatInput.trim();

      setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
      setChatInput('');
      setMessages(prev => [...prev, { role: 'ai', text: 'Đang phân tích dữ liệu...' }]);

      try {
        const aiReply = await getGeminiResponse(textToSend);
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'ai', text: aiReply };
          return newMessages;
        });
      } catch (err) {
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: 'ai', text: '⚠️ Lỗi: Cảm biến AI đang nhiễu sóng hoặc bạn đang dùng VPN ngoài vùng hỗ trợ. Vui lòng tắt VPN và thử lại!' };
          return newMessages;
        });
      }
    }
  };

  const controls = [
    { label: "+", action: handleZoomIn, title: "Phóng to", type: "zoomIn" },
    { label: "-", action: handleZoomOut, title: "Thu nhỏ", type: "zoomOut" },
    { label: "⚲", action: handleToggleMarkingMode, title: "Bật/Tắt chế độ ghim địa điểm", type: "marking" },
    { label: "⛶", action: handleToggleFullScreen, title: "Toàn màn hình", type: "fullScreen" },
  ];

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      {!isExploring && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-cosmic">
          <h1 className="text-6xl font-bold text-blue-400 tracking-widest mb-10 drop-shadow-[0_0_15px_rgba(96,165,250,0.5)]">
            JWST SPACE EXPLORER
          </h1>
          
          {/* Thanh tìm kiếm trung tâm tích hợp Gợi ý */}
          <div className="relative w-full max-w-2xl" ref={searchContainerRef}>
            <form onSubmit={handleSearchSubmit} className="flex w-full shadow-[0_0_30px_rgba(0,0,0,0.8)] rounded-full z-20 relative">
              <input
                type="text"
                className="w-full px-6 py-4 bg-slate-900/90 backdrop-blur-md border border-slate-600 rounded-l-full text-lg focus:outline-none focus:border-blue-500 text-white placeholder-slate-400"
                placeholder="Khám phá thiên hà (VD: M101, Tinh vân Orion,...)"
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={() => { if(searchQuery.trim().length > 0) setShowSuggestions(true); }}
              />
              <button type="submit" className="px-8 py-4 bg-blue-600 hover:bg-blue-500 rounded-r-full font-bold text-lg transition-colors shadow-lg">
                Khám phá
              </button>
            </form>

            {/* Menu Gợi ý (Dropdown) */}
            {showSuggestions && (
              <div className="absolute top-full left-0 w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in-down">
                {filteredSuggestions.length > 0 ? (
                  <ul className="max-h-60 overflow-y-auto">
                    {filteredSuggestions.map((suggestion, idx) => (
                      <li 
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-6 py-3 hover:bg-blue-600/50 cursor-pointer border-b border-slate-700/50 last:border-0 text-slate-200 transition-colors flex items-center gap-3"
                      >
                        <span className="text-blue-400">✨</span> {suggestion}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-6 py-4 text-slate-400 italic">
                    Chưa có trong danh mục phổ biến. Nhấn "Khám phá" để yêu cầu NASA quét sâu...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {isExploring && (
        <header className="flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800 z-20">
          <h1 className="text-xl font-bold text-blue-400 tracking-widest cursor-pointer" onClick={() => setIsExploring(false)}>JWST EXPLORER</h1>
          
          {/* Thanh tìm kiếm góc trên tích hợp Gợi ý */}
          <div className="relative w-1/3" ref={searchContainerRef}>
            <form onSubmit={handleSearchSubmit} className="flex w-full">
              <input
                type="text"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-l-md focus:outline-none focus:border-blue-500"
                placeholder="Khám phá thiên hà (VD: M1)..."
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={() => { if(searchQuery.trim().length > 0) setShowSuggestions(true); }}
              />
              <button type="submit" className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-r-md font-medium transition-colors">
                Khám phá
              </button>
            </form>
            
            {showSuggestions && (
              <div className="absolute top-full left-0 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-2xl overflow-hidden z-50">
                {filteredSuggestions.length > 0 ? (
                  <ul className="max-h-60 overflow-y-auto">
                    {filteredSuggestions.map((suggestion, idx) => (
                      <li 
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-4 py-2 hover:bg-blue-600/50 cursor-pointer border-b border-slate-700/50 last:border-0 text-sm text-slate-200"
                      >
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="px-4 py-3 text-xs text-slate-400 italic">
                    Nhấn "Khám phá" để quét sâu...
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
      )}

      <main className="flex-1 flex relative overflow-hidden">
        <section className="flex-1 relative bg-black flex items-center justify-center">
          {!isExploring ? (
            <p className="text-slate-500 italic text-lg">Vui lòng nhập tên thiên thể để nạp bản đồ vũ trụ.</p>
          ) : (
            <>
              {isWaitingForDzi && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                  <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                  <h2 className="text-2xl font-bold text-blue-400 animate-pulse tracking-widest">ĐANG TRUY XUẤT NASA MAST</h2>
                  <p className="text-slate-300 mt-4 text-xl">
                    Thời gian dự kiến còn lại: 
                    <span className="text-emerald-400 font-mono font-bold text-3xl ml-2">
                      {timeLeft > 0 ? `${timeLeft}s` : 'Đang đồng bộ hóa dữ liệu hình ảnh...'}
                    </span>
                  </p>
                  <p className="text-slate-500 text-sm mt-3 italic">(Quá trình dịch chuyển và phân rã tệp FITS gốc có thể dao động từ 1-3 phút)</p>
                </div>
              )}
              
              <div id="osd-viewer" className="absolute inset-0 w-full h-full"></div>
            </>
          )}

          {isExploring && (
            <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-10">
              {controls.map((control, idx) => (
                <button
                  key={idx}
                  onClick={control.action}
                  className={`w-10 h-10 bg-slate-800/80 hover:bg-slate-700 text-white rounded shadow border border-slate-600 flex items-center justify-center text-xl transition-colors ${control.type === 'marking' && isMarkingEnabled ? 'bg-blue-900 border-blue-500 text-blue-400' : ''}`}
                  title={control.title}
                >
                  {control.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {isExploring && (
          <aside className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col z-10 shadow-2xl">
            <div className="p-4 border-b border-slate-800 font-semibold text-emerald-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Trợ lý Gemini AI
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              <div className="bg-slate-800/50 p-3 rounded-lg text-sm text-slate-300 border border-slate-700">
                [Hệ thống]: Giao diện OpenSeadragon đang được chuẩn bị. Bạn cần hỗ trợ phân tích thông số gì từ dữ liệu FITS này?
              </div>

              <div className="flex flex-col gap-3 mt-3">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`p-3 rounded-lg text-sm border whitespace-pre-wrap ${msg.role === 'ai' ? 'bg-slate-800/50 text-slate-300 border-slate-700' : 'bg-blue-600/30 text-blue-100 border-blue-500/50 self-end text-right'}`}>
                    {msg.role === 'ai' ? (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    ) : (
                      msg.text
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950">
              <input
                type="text"
                placeholder="Hỏi AI về vật thể..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-sm focus:outline-none focus:border-emerald-500"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleChatSubmit();
                  }
                }}
              />
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}

export default App;