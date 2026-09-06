export interface SampleArticle {
  id: string;
  name: string;
  description: string;
  html: string;
  url?: string;
}

export const SAMPLE_ARTICLES: SampleArticle[] = [
  {
    id: 'hoa-don-dien-tu',
    name: '1. Bài viết: Thời điểm lập hóa đơn điện tử (Có ảnh minh họa + Biểu mẫu công văn + Logo)',
    description: 'Chứa 2 ảnh minh họa người làm việc, 1 ảnh biểu mẫu công văn nhà nước (giữ lại), 1 logo đối tác.',
    url: 'https://ketoandieutam.vn/thoi-diem-lap-hoa-don-dien-tu',
    html: `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Thời điểm lập hóa đơn điện tử khi bán hàng hóa dịch vụ theo Nghị định 123</title>
  <meta name="description" content="Hướng dẫn chi tiết về thời điểm xuất hóa đơn điện tử hợp lệ theo Nghị định 123/2020/NĐ-CP và Thông tư 78/2021/TT-BTC dành cho kế toán doanh nghiệp.">
  <meta property="og:title" content="Thời điểm lập hóa đơn điện tử khi bán hàng hóa dịch vụ theo Nghị định 123">
  <meta property="og:image" content="https://picsum.photos/seed/old-feature/1200/630">
</head>
<body>
  <header>
    <div class="site-header">
      <img src="https://picsum.photos/seed/site-logo/200/60" alt="Logo Tạp chí Kế toán Thuế" class="site-logo">
      <nav><a href="#">Trang chủ</a> | <a href="#">Thuế & Kế toán</a></nav>
    </div>
  </header>

  <main class="main-layout">
    <article class="article-prose">
      <h1>Thời điểm lập hóa đơn điện tử khi bán hàng hóa dịch vụ theo Nghị định 123</h1>
      <p class="lead">Việc xác định đúng thời điểm lập hóa đơn điện tử không chỉ giúp doanh nghiệp tuân thủ đúng pháp luật về thuế mà còn tránh nguy cơ bị xử phạt vi phạm hành chính từ 4 đến 8 triệu đồng.</p>

      <figure class="article-featured-image">
        <img src="https://picsum.photos/seed/old-lead-img/800/450" alt="Ảnh minh họa cũ kế toán ngồi máy tính xuất hóa đơn">
        <figcaption>Xác định đúng thời điểm xuất hóa đơn giúp doanh nghiệp tránh rủi ro thanh kiểm tra.</figcaption>
      </figure>

      <h2>1. Nguyên tắc chung về thời điểm lập hóa đơn đối với bán hàng hóa</h2>
      <p>Theo khoản 1 Điều 9 Nghị định số 123/2020/NĐ-CP, thời điểm lập hóa đơn đối với bán hàng hóa là thời điểm chuyển giao quyền sở hữu hoặc quyền sử dụng hàng hóa cho người mua, không phân biệt đã thu được tiền hay chưa thu được tiền.</p>
      <p>Kế toán kho và kế toán bán hàng cần phối hợp chặt chẽ với bộ phận giao nhận để kiểm tra biên bản giao nhận hàng hóa và thời điểm ký nhận trước khi xuất hóa đơn.</p>
      
      <p><img src="https://picsum.photos/seed/accountant-checking-invoice/600/400" alt="Ảnh stock nhân viên kế toán kiểm tra chứng từ bán hàng cũ"></p>

      <h2>2. Thời điểm lập hóa đơn đối với cung cấp dịch vụ</h2>
      <p>Đối với hoạt động cung cấp dịch vụ, thời điểm lập hóa đơn là thời điểm hoàn thành việc cung cấp dịch vụ, không phân biệt đã thu được tiền hay chưa thu được tiền.</p>
      <p>Trường hợp người cung cấp dịch vụ có thu tiền trước hoặc trong khi cung cấp dịch vụ thì thời điểm lập hóa đơn là thời điểm thu tiền (không bao gồm tiền đặt cọc giữ chỗ phục vụ dịch vụ ăn uống, khách sạn...).</p>

      <p><img src="https://picsum.photos/seed/business-discussion-service/600/400" alt="Ảnh minh họa trao đổi hợp đồng cung ứng dịch vụ doanh nghiệp"></p>

      <h2>3. Biểu mẫu tờ khai và công văn hướng dẫn của Cục Thuế</h2>
      <p>Doanh nghiệp cần lưu ý Mẫu số 01/ĐKTĐ-HĐĐT ban hành kèm theo Nghị định số 123/2020/NĐ-CP khi đăng ký thay đổi thông tin sử dụng hóa đơn điện tử có mã hoặc không có mã của cơ quan thuế.</p>
      
      <p><img src="https://picsum.photos/seed/scanned-form-01/500/700" alt="Bản chụp Mẫu số 01 ĐKTĐ-HĐĐT đăng ký sử dụng hóa đơn điện tử có dấu mộc"></p>

      <h2>4. Mức phạt khi xuất hóa đơn sai thời điểm</h2>
      <p>Hành vi lập hóa đơn không đúng thời điểm có thể bị phạt cảnh cáo hoặc phạt tiền từ 3.000.000 đồng đến 8.000.000 đồng tùy thuộc vào tính chất và số lượng hóa đơn vi phạm.</p>
    </article>
  </main>

  <footer>
    <p>© 2026 Bản quyền thuộc KTDT Portal. Mọi hành vi sao chép phải trích dẫn nguồn.</p>
  </footer>
</body>
</html>`
  },
  {
    id: 'giam-thue-gtgt',
    name: '2. Bài viết: Giảm thuế GTGT 2% (Có 1 ảnh minh họa + 1 bảng biểu so sánh)',
    description: 'Chứa 1 ảnh minh họa cuộc họp doanh nghiệp và 1 ảnh chụp bảng biểu thuế suất so sánh (cần duyệt tay).',
    html: `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Chính sách giảm thuế GTGT 2% năm 2026: Điều kiện và danh mục ngành nghề áp dụng</title>
  <meta name="description" content="Tổng hợp quy định giảm thuế giá trị gia tăng từ 10% xuống 8% áp dụng cho nhóm hàng hóa, dịch vụ theo nghị quyết mới nhất.">
</head>
<body>
  <div class="container">
    <div class="article-content">
      <h1>Chính sách giảm thuế GTGT 2% năm 2026: Điều kiện và danh mục ngành nghề áp dụng</h1>
      <p class="summary">Chính sách giảm 2% thuế suất thuế GTGT tiếp tục là giải pháp hỗ trợ thiết thực, giúp giảm giá thành hàng hóa, kích cầu tiêu dùng nội địa và tháo gỡ khó khăn cho các doanh nghiệp SME.</p>

      <h2>Tác động của chính sách giảm thuế tới hoạt động sản xuất kinh doanh</h2>
      <p>Việc tiếp tục duy trì mức thuế suất 8% cho nhiều nhóm mặt hàng thiết yếu giúp các cơ sở kinh doanh tiết giảm chi phí đầu vào, tối ưu hóa dòng tiền và duy trì thanh khoản trong quý đầu năm.</p>
      
      <p><img src="https://picsum.photos/seed/sme-meeting-tax/640/420" alt="Ảnh tư liệu họp bàn phương án cân đối chi phí thuế"></p>

      <h2>Bảng tổng hợp danh mục nhóm ngành nghề loại trừ không được giảm thuế</h2>
      <p>Doanh nghiệp lưu ý các lĩnh vực viễn thông, tài chính, ngân hàng, chứng khoán, bảo hiểm, kinh doanh bất động sản, kim loại và sản phẩm từ kim loại đúc sẵn không thuộc diện được áp dụng giảm thuế.</p>

      <p><img src="https://picsum.photos/seed/table-vat-comparison-chart/700/350" alt="Bảng số liệu thống kê so sánh danh mục mã ngành cấp 1 và cấp 2 chịu thuế 10%"></p>

      <h2>Lưu ý khi xuất hóa đơn giảm thuế 8%</h2>
      <p>Cơ sở kinh doanh tính thuế GTGT theo phương pháp khấu trừ khi lập hóa đơn GTGT ghi rõ thuế suất 8% tại dòng thuế suất thuế GTGT. Trường hợp cơ sở kinh doanh áp dụng phương pháp tỷ lệ % trên doanh thu thì được giảm 20% mức tỷ lệ %.</p>
    </div>
  </div>
</body>
</html>`
  },
  {
    id: 'quyet-toan-tndn-no-inline',
    name: '3. Bài viết: 5 Lưu ý quyết toán thuế TNDN (KHÔNG có ảnh trong bài - Chỉ tạo 1 ảnh Featured)',
    description: 'Thử nghiệm trường hợp bài viết không chứa ảnh inline ban đầu -> Chỉ tạo đúng 1 ảnh Featured duy nhất, không tự ý bịa thêm ảnh.',
    html: `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>5 Lưu ý trọng yếu khi thực hiện quyết toán thuế thu nhập doanh nghiệp</title>
  <meta name="description" content="Những điểm cốt lõi giúp kế toán trưởng kiểm soát chi phí được trừ, trích lập dự phòng và tránh bị loại chi phí khi thanh tra thuế.">
</head>
<body>
  <div class="article-prose">
    <h1>5 Lưu ý trọng yếu khi thực hiện quyết toán thuế thu nhập doanh nghiệp</h1>
    <p class="lead">Mùa quyết toán thuế luôn là giai đoạn căng thẳng đối với đội ngũ kế toán tài chính. Dưới đây là 5 nội dung trọng yếu cần rà soát kỹ lưỡng trước khi nộp tờ khai quyết toán thuế TNDN Mẫu số 03/TNDN.</p>

    <h2>1. Rà soát chứng từ thanh toán không dùng tiền mặt</h2>
    <p>Đối với hóa đơn mua hàng hóa, dịch vụ từng lần có giá trị từ 20 triệu đồng trở lên (giá đã bao gồm thuế GTGT) bắt buộc phải có chứng từ thanh toán không dùng tiền mặt. Kế toán cần đối chiếu sao kê ngân hàng với từng hóa đơn đầu vào.</p>

    <h2>2. Chi phí tiền lương và các khoản trích theo lương</h2>
    <p>Tiền lương, tiền thưởng phải được quy định cụ thể tại hợp đồng lao động, thỏa ước lao động tập thể hoặc quy chế tài chính của doanh nghiệp. Đảm bảo đã chi trả thực tế trước thời hạn nộp hồ sơ quyết toán thuế năm.</p>

    <h2>3. Khấu hao tài sản cố định đúng khung quy định</h2>
    <p>Trích khấu hao tài sản cố định phải phù hợp với Thông tư số 45/2013/TT-BTC. Các tài sản không phục vụ hoạt động sản xuất kinh doanh hoặc vượt định mức cho phép sẽ bị loại khỏi chi phí hợp lý khi tính thuế.</p>

    <h2>4. Kiểm tra chi phí lãi vay đối với doanh nghiệp có giao dịch liên kết</h2>
    <p>Căn cứ Nghị định số 132/2020/NĐ-CP, tổng chi phí lãi vay sau khi trừ lãi tiền gửi và lãi cho vay phát sinh trong kỳ được trừ khi xác định thu nhập chịu thuế TNDN không vượt quá 30% tổng lợi nhuận thuần từ hoạt động kinh doanh cộng chi phí lãi vay cộng chi phí khấu hao (EBITDA).</p>

    <h2>5. Chuyển lỗ từ các năm trước theo nguyên tắc liên tục</h2>
    <p>Doanh nghiệp có số lỗ phát sinh từ các kỳ tính thuế trước được chuyển toàn bộ và liên tục số lỗ vào thu nhập chịu thuế của những năm tiếp theo, thời gian chuyển lỗ không quá 5 năm kể từ năm tiếp sau năm phát sinh lỗ.</p>
  </div>
</body>
</html>`
  }
];
