const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const aiStart = code.indexOf('if (ai && analysisClient) {');
const aiEnd = code.indexOf('    // Safeguard 1: Ensure feature-1 is always REPLACE_AI and selected');

if (aiStart === -1 || aiEnd === -1) {
  console.log("Could not find AI block!");
  process.exit(1);
}

const newAiBlock = `    if (ai && analysisClient) {
      try {
        const analyzeFeatured = async () => {
          const promptText = \`Bạn là chuyên gia biên tập hình ảnh cho báo chí kinh tế, thuế, kế toán doanh nghiệp Việt Nam (KTDT).
Tiêu đề bài viết: "\${effectiveArticleTitle}"
Tóm tắt: "\${excerpt || 'Không có'}"
Slug: "\${slug}"

Nhiệm vụ: Đề xuất ý tưởng (concept), câu lệnh tạo ảnh (prompt) và các metadata cho ảnh đại diện chính (Featured Image).
Ảnh này KHÔNG có hình ảnh gốc đính kèm, hoàn toàn tạo mới từ ý tưởng văn bản.

YÊU CẦU:
- featured_concept: Ý tưởng bằng Tiếng Việt (chuyên nghiệp, văn phòng).
- featured_generation_prompt: Bằng Tiếng Anh, chuẩn nhiếp ảnh báo chí editorial.
- featured_cover_caption: Đề xuất một câu tiêu đề tiếng Việt (5-10 từ) ngắn gọn, mạnh mẽ dựa trên Tiêu đề bài viết.
- featured_alt, featured_title, featured_caption: Theo quy chuẩn báo chí tiếng Việt.
- enable_text_in_image: true (vì featured luôn có text).
\`;
          const contentsParts = [{ text: promptText }];
          if (slotImageBuffers.has('feature-1')) {
            const fb = slotImageBuffers.get('feature-1');
            contentsParts.push({ text: \`\\n--- [Dữ liệu hình ảnh thực tế của Slot feature-1] ---\` });
            contentsParts.push({
              inlineData: {
                mimeType: fb.mimeType,
                data: fb.buffer.toString('base64'),
              },
            });
          }

          const response = await ai.models.generateContent({
            model: analysisClient.model,
            contents: [{ role: 'user', parts: contentsParts }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  featured_concept: { type: 'STRING' },
                  featured_generation_prompt: { type: 'STRING' },
                  featured_alt: { type: 'STRING' },
                  featured_title: { type: 'STRING' },
                  featured_caption: { type: 'STRING' },
                  featured_cover_caption: { type: 'STRING' },
                  enable_text_in_image: { type: 'BOOLEAN' }
                }
              }
            }
          });
          const result = JSON.parse(response.text);
          const targetSlot = slots[0];
          if (targetSlot) {
            targetSlot.suggested_concept = result.featured_concept || targetSlot.suggested_concept;
            targetSlot.generation_prompt = result.featured_generation_prompt || targetSlot.generation_prompt;
            targetSlot.suggested_alt = result.featured_alt || targetSlot.suggested_alt;
            targetSlot.title = result.featured_title;
            targetSlot.caption = result.featured_caption;
            targetSlot.cover_caption = result.featured_cover_caption;
            targetSlot.enable_text_in_image = result.enable_text_in_image ?? true;
            targetSlot.visual_analysis_status = 'success';
          }
        };

        const inlinePromises = images.map(async (img, i) => {
          const slotId = \`inline-\${i + 1}\`;
          const slotObj = slots.find((s) => s.slot_id === slotId);
          if (!slotObj) return;
          const hasVisual = slotImageBuffers.has(slotId);
          
          const promptText = \`Bạn là chuyên gia biên tập hình ảnh báo chí (KTDT).
Tiêu đề bài viết: "\${effectiveArticleTitle}"
Tóm tắt: "\${excerpt || 'Không có'}"

Phân tích ảnh nguồn sau đây:
- Vị trí ảnh: \${slotId}
- Nguồn ảnh cũ: \${img.old_src}
- Alt cũ: \${img.old_alt || 'Trống'}
- Tiêu đề mục: \${img.context_heading || 'Không có'}
- Đoạn văn trước: \${img.context_before || 'Không có'}
- Đoạn văn sau: \${img.context_after || 'Không có'}
- Phân tích thị giác: \${hasVisual ? 'ĐÃ CÓ ảnh đính kèm.' : 'KHÔNG có ảnh đính kèm, chỉ dùng văn bản.'}

QUY TẮC:
1. Xác định \`visual_type\` (ví dụ: "document", "screenshot", "illustration", "banner", "photo", "form", "invoice").
2. Nếu là tài liệu, biểu mẫu, hóa đơn, công văn, screenshot phần mềm chứa dữ liệu nhạy cảm hoặc dày đặc chữ -> \`is_sensitive_document: true\`.
3. Trích xuất \`primary_headline\` nếu ảnh có chữ lớn/nổi bật.
4. Xác định \`classification\`:
   - Nếu is_sensitive_document = true -> MANUAL_REVIEW, confidence: 'high'
   - Nếu ảnh phong cảnh/minh họa/banner/stock -> GENERATE_FROM_SOURCE_AI
   - Nếu mâu thuẫn giữa chữ và ảnh -> MANUAL_REVIEW
5. Nếu GENERATE_FROM_SOURCE_AI:
   - Ý TƯỞNG TẠO ẢNH: AI sẽ tạo MỘT ẢNH MỚI. Ảnh mới phải GIỮ Ý NGHĨA CHÍNH của ảnh cũ, nhưng KHÁC ĐỦ NHIỀU để không bị xem là bắt chước (thay đổi góc máy, bố cục, ánh sáng).
   - Nếu ảnh gốc có chữ nổi bật -> \`enable_text_in_image: true\`, và gợi ý lại nội dung chữ trong \`cover_caption\` (viết lại cho hay, không copy nguyên văn).
   - \`generation_prompt\` (Tiếng Anh) phải ghi rõ: "preserve the same core topic, do NOT make a near-duplicate, create a clearly new composition."
\`;

          const contentsParts = [{ text: promptText }];
          if (hasVisual) {
            const bufObj = slotImageBuffers.get(slotId);
            contentsParts.push({ text: \`\\n--- [Dữ liệu hình ảnh] ---\` });
            contentsParts.push({
              inlineData: {
                mimeType: bufObj.mimeType,
                data: bufObj.buffer.toString('base64'),
              },
            });
          }

          try {
            const response = await ai.models.generateContent({
              model: analysisClient.model,
              contents: [{ role: 'user', parts: contentsParts }],
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: 'OBJECT',
                  properties: {
                    visual_type: { type: 'STRING' },
                    has_text: { type: 'BOOLEAN' },
                    text_density: { type: 'STRING' },
                    primary_headline: { type: 'STRING' },
                    is_sensitive_document: { type: 'BOOLEAN' },
                    classification: { type: 'STRING', description: 'GENERATE_FROM_SOURCE_AI, IGNORE, MANUAL_REVIEW' },
                    confidence: { type: 'STRING', description: 'high, medium, low' },
                    reason: { type: 'STRING' },
                    concept: { type: 'STRING' },
                    generation_prompt: { type: 'STRING' },
                    alt: { type: 'STRING' },
                    title: { type: 'STRING' },
                    caption: { type: 'STRING' },
                    cover_caption: { type: 'STRING' },
                    enable_text_in_image: { type: 'BOOLEAN' },
                    visual_description: { type: 'STRING' },
                    textual_description: { type: 'STRING' }
                  }
                }
              }
            });
            const result = JSON.parse(response.text);
            
            slotObj.classification = result.classification === 'GENERATE_FROM_SOURCE_AI' ? 'REPLACE_AI' : (result.classification || slotObj.classification);
            
            if (result.classification === 'GENERATE_FROM_SOURCE_AI') {
              slotObj.processing_strategy = 'GENERATE_FROM_SOURCE_AI';
              slotObj.processing_strategy_status = 'recommended';
              slotObj.selected = true;
            } else if (result.classification === 'KEEP_ORIGINAL') {
              slotObj.processing_strategy = 'REBUILD_FROM_SOURCE';
              slotObj.processing_strategy_status = 'recommended';
              slotObj.selected = true;
            } else if (result.is_sensitive_document) {
              slotObj.processing_strategy = 'NEEDS_DECISION';
              slotObj.processing_strategy_status = 'needs_decision';
              slotObj.selected = false;
            } else {
              slotObj.processing_strategy = 'NEEDS_DECISION';
              slotObj.processing_strategy_status = 'needs_decision';
              slotObj.selected = false;
            }
            
            slotObj.confidence = result.confidence || slotObj.confidence;
            slotObj.reason = result.reason || slotObj.reason;
            if (result.concept) {
              slotObj.suggested_concept = result.concept;
              slotObj.concept = result.concept;
            }
            slotObj.generation_prompt = result.generation_prompt || slotObj.generation_prompt;
            
            if (result.alt) {
              slotObj.suggested_alt = result.alt;
              slotObj.alt = result.alt;
            }
            slotObj.title = result.title;
            slotObj.caption = result.caption;
            
            slotObj.visual_type = result.visual_type;
            slotObj.has_text = result.has_text;
            slotObj.text_density = result.text_density;
            slotObj.primary_headline = result.primary_headline;
            slotObj.is_sensitive_source = result.is_sensitive_document;
            slotObj.cover_caption = result.cover_caption;
            slotObj.enable_text_in_image = result.enable_text_in_image;
            slotObj.visual_description = result.visual_description;
            slotObj.textual_description = result.textual_description;
            
            slotObj.visual_analysis_status = 'success';
            slotObj.visual_analysis_available = hasVisual;
            
            if (result.is_sensitive_document) {
              slotObj.reason = "Không khuyến nghị AI tạo lại từ ảnh gốc (ảnh chứa dữ liệu biểu mẫu/tài liệu). " + slotObj.reason;
            }
          } catch (e) {
            console.error(\`AI analysis failed for \${slotId}:\`, e);
            slotObj.visual_analysis_status = 'failed';
            slotObj.visual_analysis_available = false;
          }
        });

        await Promise.allSettled([analyzeFeatured(), ...inlinePromises]);
      } catch (err: any) {
        console.error('AI Multimodal Classification Error:', err);
      }
    } else {
      // Vertex AI not configured
      slots.forEach((s) => {
        s.visual_analysis_status = 'unavailable';
        s.visual_analysis_available = false;
        if (s.slot_id === 'feature-1') {
          s.processing_strategy = 'GENERATE_AI';
          s.processing_strategy_status = 'recommended';
          s.selected = true;
        } else {
          if (s.is_sensitive_source || s.confidence === 'low' || s.classification === 'MANUAL_REVIEW') {
            s.processing_strategy = 'NEEDS_DECISION';
            s.processing_strategy_status = 'needs_decision';
            s.selected = false;
            s.reason =
              'AI chưa được cấu hình. Hình ảnh nhạy cảm cần biên tập viên quyết định.';
          } else {
            s.processing_strategy = 'GENERATE_AI';
            s.processing_strategy_status = 'recommended';
            s.selected = true;
            s.reason = 'Ảnh minh họa dựa trên ngữ cảnh bài viết.';
          }
        }
      });
    }
`;

code = code.substring(0, aiStart) + newAiBlock + code.substring(aiEnd);
fs.writeFileSync('server.ts', code);
