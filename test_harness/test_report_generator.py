"""
Test Report Generator
Generates comprehensive test reports in HTML and JSON formats
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path


class TestReportGenerator:
    """Generate test reports"""
    
    def __init__(self, report_dir: str = "test_reports"):
        self.report_dir = Path(report_dir)
        self.report_dir.mkdir(exist_ok=True)
        
    def generate_json_report(self, test_results: Dict[str, Any], filename: str = None) -> str:
        """Generate JSON test report"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"test_report_{timestamp}.json"
        
        filepath = self.report_dir / filename
        
        report = {
            "timestamp": datetime.now().isoformat(),
            "summary": test_results.get("summary", {}),
            "test_suites": test_results.get("test_suites", {}),
            "performance_metrics": test_results.get("performance_metrics", {}),
            "issues": test_results.get("issues", []),
            "recommendations": test_results.get("recommendations", [])
        }
        
        with open(filepath, 'w') as f:
            json.dump(report, f, indent=2)
        
        return str(filepath)
    
    def generate_html_report(self, test_results: Dict[str, Any], filename: str = None) -> str:
        """Generate HTML test report"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"test_report_{timestamp}.html"
        
        filepath = self.report_dir / filename
        
        summary = test_results.get("summary", {})
        test_suites = test_results.get("test_suites", {})
        performance_metrics = test_results.get("performance_metrics", {})
        issues = test_results.get("issues", [])
        recommendations = test_results.get("recommendations", [])
        
        # Calculate overall stats
        total_tests = sum(suite.get("total", 0) for suite in test_suites.values())
        total_passed = sum(suite.get("passed", 0) for suite in test_suites.values())
        total_failed = total_tests - total_passed
        overall_pass_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
        
        html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kayak Simulation Test Report</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
            padding: 20px;
        }}
        .container {{
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }}
        h1 {{
            color: #2c3e50;
            margin-bottom: 10px;
        }}
        .timestamp {{
            color: #7f8c8d;
            margin-bottom: 30px;
        }}
        .summary {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }}
        .summary-card {{
            background: #f8f9fa;
            padding: 20px;
            border-radius: 6px;
            border-left: 4px solid #3498db;
        }}
        .summary-card.passed {{
            border-left-color: #27ae60;
        }}
        .summary-card.failed {{
            border-left-color: #e74c3c;
        }}
        .summary-card h3 {{
            font-size: 14px;
            color: #7f8c8d;
            margin-bottom: 10px;
        }}
        .summary-card .value {{
            font-size: 32px;
            font-weight: bold;
            color: #2c3e50;
        }}
        .test-suite {{
            margin-bottom: 40px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
        }}
        .test-suite-header {{
            background: #34495e;
            color: white;
            padding: 15px 20px;
            font-weight: bold;
        }}
        .test-suite-content {{
            padding: 20px;
        }}
        .test-result {{
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .test-result.passed {{
            background: #d4edda;
            color: #155724;
        }}
        .test-result.failed {{
            background: #f8d7da;
            color: #721c24;
        }}
        .test-name {{
            font-weight: 500;
        }}
        .test-duration {{
            color: #6c757d;
            font-size: 14px;
        }}
        .test-message {{
            font-size: 12px;
            color: #6c757d;
            margin-top: 5px;
        }}
        .performance-metrics {{
            background: #e8f4f8;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 30px;
        }}
        .performance-metrics h2 {{
            margin-bottom: 15px;
        }}
        .metric {{
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #d0d0d0;
        }}
        .metric:last-child {{
            border-bottom: none;
        }}
        .issues {{
            background: #fff3cd;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 30px;
        }}
        .issue {{
            padding: 10px;
            margin: 5px 0;
            background: white;
            border-left: 3px solid #ffc107;
            border-radius: 4px;
        }}
        .recommendations {{
            background: #d1ecf1;
            padding: 20px;
            border-radius: 6px;
        }}
        .recommendation {{
            padding: 10px;
            margin: 5px 0;
            background: white;
            border-left: 3px solid #17a2b8;
            border-radius: 4px;
        }}
        .pass-rate {{
            font-size: 48px;
            font-weight: bold;
            color: {'#27ae60' if overall_pass_rate >= 95 else '#e74c3c'};
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Kayak Simulation Test Report</h1>
        <div class="timestamp">Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</div>
        
        <div class="summary">
            <div class="summary-card">
                <h3>Total Tests</h3>
                <div class="value">{total_tests}</div>
            </div>
            <div class="summary-card passed">
                <h3>Passed</h3>
                <div class="value">{total_passed}</div>
            </div>
            <div class="summary-card failed">
                <h3>Failed</h3>
                <div class="value">{total_failed}</div>
            </div>
            <div class="summary-card">
                <h3>Pass Rate</h3>
                <div class="pass-rate">{overall_pass_rate:.1f}%</div>
            </div>
        </div>
        
        {self._generate_performance_section(performance_metrics)}
        
        {self._generate_test_suites_section(test_suites)}
        
        {self._generate_issues_section(issues)}
        
        {self._generate_recommendations_section(recommendations)}
    </div>
</body>
</html>
"""
        
        with open(filepath, 'w') as f:
            f.write(html)
        
        return str(filepath)
    
    def _generate_performance_section(self, metrics: Dict[str, Any]) -> str:
        """Generate performance metrics section"""
        if not metrics:
            return ""
        
        metric_items = []
        for key, value in metrics.items():
            if isinstance(value, dict):
                for sub_key, sub_value in value.items():
                    metric_items.append(f'<div class="metric"><span>{key} - {sub_key}</span><span>{sub_value}</span></div>')
            else:
                metric_items.append(f'<div class="metric"><span>{key}</span><span>{value}</span></div>')
        
        return f"""
        <div class="performance-metrics">
            <h2>📊 Performance Metrics</h2>
            {''.join(metric_items)}
        </div>
        """
    
    def _generate_test_suites_section(self, test_suites: Dict[str, Any]) -> str:
        """Generate test suites section"""
        sections = []
        
        for suite_name, suite_data in test_suites.items():
            results = suite_data.get("results", [])
            total = suite_data.get("total", 0)
            passed = suite_data.get("passed", 0)
            failed = suite_data.get("failed", 0)
            pass_rate = suite_data.get("pass_rate", 0)
            
            test_items = []
            for result in results:
                status_class = "passed" if result.get("passed", False) else "failed"
                test_name = result.get("test_name", "Unknown")
                duration = result.get("duration", 0)
                message = result.get("message", "")
                
                test_items.append(f"""
                <div class="test-result {status_class}">
                    <div>
                        <div class="test-name">{test_name}</div>
                        {f'<div class="test-message">{message}</div>' if message else ''}
                    </div>
                    <div class="test-duration">{duration:.2f}s</div>
                </div>
                """)
            
            sections.append(f"""
            <div class="test-suite">
                <div class="test-suite-header">
                    {suite_name} - {passed}/{total} passed ({pass_rate:.1f}%)
                </div>
                <div class="test-suite-content">
                    {''.join(test_items)}
                </div>
            </div>
            """)
        
        return ''.join(sections)
    
    def _generate_issues_section(self, issues: List[Dict[str, Any]]) -> str:
        """Generate issues section"""
        if not issues:
            return ""
        
        issue_items = []
        for issue in issues:
            title = issue.get("title", "Unknown Issue")
            description = issue.get("description", "")
            severity = issue.get("severity", "medium")
            
            issue_items.append(f"""
            <div class="issue">
                <strong>{title}</strong> ({severity})
                <div>{description}</div>
            </div>
            """)
        
        return f"""
        <div class="issues">
            <h2>⚠️ Identified Issues</h2>
            {''.join(issue_items)}
        </div>
        """
    
    def _generate_recommendations_section(self, recommendations: List[str]) -> str:
        """Generate recommendations section"""
        if not recommendations:
            return ""
        
        rec_items = []
        for rec in recommendations:
            rec_items.append(f'<div class="recommendation">{rec}</div>')
        
        return f"""
        <div class="recommendations">
            <h2>💡 Recommendations</h2>
            {''.join(rec_items)}
        </div>
        """
    
    def generate_summary_report(self, test_results: Dict[str, Any]) -> str:
        """Generate a brief summary report"""
        summary = test_results.get("summary", {})
        test_suites = test_results.get("test_suites", {})
        
        total_tests = sum(suite.get("total", 0) for suite in test_suites.values())
        total_passed = sum(suite.get("passed", 0) for suite in test_suites.values())
        total_failed = total_tests - total_passed
        overall_pass_rate = (total_passed / total_tests * 100) if total_tests > 0 else 0
        
        report = f"""
╔══════════════════════════════════════════════════════════════╗
║           KAYAK SIMULATION TEST REPORT SUMMARY              ║
╚══════════════════════════════════════════════════════════════╝

Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}

OVERALL RESULTS:
  Total Tests: {total_tests}
  Passed: {total_passed} ✅
  Failed: {total_failed} ❌
  Pass Rate: {overall_pass_rate:.1f}%

TEST SUITES:
"""
        
        for suite_name, suite_data in test_suites.items():
            suite_total = suite_data.get("total", 0)
            suite_passed = suite_data.get("passed", 0)
            suite_failed = suite_data.get("failed", 0)
            suite_pass_rate = suite_data.get("pass_rate", 0)
            
            report += f"""
  {suite_name}:
    Total: {suite_total}
    Passed: {suite_passed}
    Failed: {suite_failed}
    Pass Rate: {suite_pass_rate:.1f}%
"""
        
        performance = test_results.get("performance_metrics", {})
        if performance:
            report += "\nPERFORMANCE METRICS:\n"
            for key, value in performance.items():
                report += f"  {key}: {value}\n"
        
        issues = test_results.get("issues", [])
        if issues:
            report += f"\nISSUES FOUND: {len(issues)}\n"
            for issue in issues[:5]:  # Show first 5
                report += f"  - {issue.get('title', 'Unknown')}\n"
        
        report += "\n" + "="*60 + "\n"
        
        return report

