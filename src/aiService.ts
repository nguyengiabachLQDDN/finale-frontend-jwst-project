import { GoogleGenerativeAI } from '@google/generative-ai';

// Hàm xuất khẩu được gọi từ App.tsx
export const getGeminiResponse = async (prompt: string): Promise<string> => {
  // Lấy API key từ file .env an toàn
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Thiếu VITE_GEMINI_API_KEY trong môi trường.");
    return "⚠️ Lỗi hệ thống: Trợ lý AI chưa được cấp quyền truy cập (Missing API Key).";
  }

  try {
    // Khởi tạo động cơ Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Sử dụng model Flash tối ưu tốc độ cho ứng dụng web thực thời
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Đóng gói bối cảnh để AI luôn nhớ mình là chuyên gia thiên văn
    const systemPrompt = `Bạn là Trợ lý AI của dự án JWST Space Explorer. Khách hàng đang khám phá bản đồ vũ trụ DeepZoom. Hãy trả lời các câu hỏi về thiên văn học một cách ngắn gọn, sinh động, dễ hiểu bằng tiếng Việt.\n\nCâu hỏi của người dùng: ${prompt}`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    
    return response.text();
  } catch (error) {
    console.error("Lỗi giao tiếp với Gemini API:", error);
    return "⚠️ Cảm biến AI đang nhiễu sóng. Không thể phản hồi lúc này.";
  }
};